# Scene State Provider — Concurrency & History Spec

## Core Invariants

1. **One active writer per frame.** At most one adapter may write state within
   a single animation frame. Competing writes in the same frame are rejected.
2. **Writes require registration.** Only registered adapters can write. Unknown
   source IDs are rejected silently.
3. **Monotonic timestamps.** Each accepted write must have a timestamp ≥ the
   previous write. Out-of-order writes are rejected.
4. **Controller stickiness.** Once an adapter claims control (e.g. user started
   dragging in Cesium), it holds control until it explicitly releases or another
   adapter claims via user interaction. Programmatic writes (animations) use a
   separate priority lane.
5. **Immutable snapshots.** The state object returned by reads is never mutated
   in place. Each write produces a new object reference.

## Provider Shape

```typescript
type SceneStateProviderValue = {
  // --- Reads (safe to call any time, any component) ---
  getState(): CommonSceneState | null;
  getControllerId(): string | null;
  subscribe(listener: () => void): () => void;

  // --- Registration (adapters only) ---
  register(id: string, engine: string): () => void;  // returns unregister

  // --- Writes (adapters + animation controller) ---
  update(next: CommonSceneState, writeToken: WriteToken): WriteResult;
  claimControl(id: string, priority: WritePriority): boolean;
  releaseControl(id: string): void;

  // --- History (read-only for consumers, managed internally) ---
  getHistory(): HistoryView;
};
```

## Write Protocol

### WriteToken

Every `update()` call must supply a token that identifies the writer and the
frame. The provider validates the token before accepting the write.

```typescript
type WriteToken = {
  sourceId: string;         // registered adapter ID
  timestampMs: number;      // Date.now() or performance.now()
  priority: WritePriority;  // who can preempt whom
};

type WritePriority =
  | "user-interaction"   // mouse/touch/keyboard in a framework — highest
  | "animation"          // programmatic camera animation
  | "sync"               // cross-framework sync (applying another adapter's state)
  | "restore"            // restoring from history or hash — lowest active priority
  ;
```

### WriteResult

```typescript
type WriteResult =
  | { accepted: true; frameId: number }
  | { rejected: true; reason: WriteRejectionReason }
  ;

type WriteRejectionReason =
  | "unregistered-source"      // sourceId not registered
  | "not-controller"           // another adapter holds control at equal/higher priority
  | "frame-already-written"    // another write was accepted this frame
  | "stale-timestamp"          // timestamp older than last accepted write
  ;
```

### Frame Guard

```
frameWriteState = {
  frameId: number,           // increments per rAF tick (or per accepted write if no rAF)
  writtenBy: string | null,  // sourceId that wrote this frame
  writtenAt: number,         // timestamp of the write
}
```

The provider advances `frameId` on each `requestAnimationFrame` callback.
Within a single frame, only the first valid `update()` is accepted. Subsequent
calls from different sources in the same frame are rejected with
`"frame-already-written"`. Calls from the **same source** in the same frame
replace the previous write (last-write-wins for a single adapter correcting
itself within one frame).

### Controller Arbitration

```
controllerState = {
  id: string | null,
  priority: WritePriority,
  claimedAt: number,
}
```

Rules:
- `claimControl(id, priority)` succeeds if:
  - No current controller, OR
  - New priority ≥ current priority, OR
  - Current controller hasn't written for N frames (stale controller timeout)
- `releaseControl(id)` succeeds if `id` matches current controller.
- `"user-interaction"` always preempts `"animation"` / `"sync"` / `"restore"`.
- `"animation"` preempts `"sync"` and `"restore"` but not `"user-interaction"`.
- When an adapter calls `update()` and is not the controller, the write is
  rejected unless the adapter's priority is high enough to implicitly claim.

Stale controller timeout: if the controller hasn't written for 10 frames
(~166ms at 60fps), any other registered adapter can claim. This prevents
a destroyed adapter from permanently holding control.

## History Ring Buffer

### Storage

```typescript
type HistoryEntry = {
  state: CommonSceneState;    // immutable snapshot
  sourceId: string;
  priority: WritePriority;
  timestampMs: number;
  frameId: number;
};

type HistoryConfig = {
  maxEntries: number;          // default 120 (~2 seconds at 60fps)
  snapshotIntervalMs: number;  // minimum interval between stored entries (default 500ms)
  keyframeIntervalMs: number;  // force-store interval for sparse history (default 2000ms)
};
```

Not every frame is stored. The history buffer samples at `snapshotIntervalMs`
intervals, plus forces a keyframe every `keyframeIntervalMs`. This keeps memory
bounded while providing meaningful undo points.

### HistoryView (read-only API)

```typescript
type HistoryView = {
  readonly entries: readonly HistoryEntry[];
  readonly length: number;
  readonly oldestTimestampMs: number | null;
  readonly newestTimestampMs: number | null;

  // Find nearest entry to a timestamp
  nearest(timestampMs: number): HistoryEntry | null;

  // Get last N entries
  recent(count: number): readonly HistoryEntry[];

  // Get the last entry from a specific source
  lastFrom(sourceId: string): HistoryEntry | null;
};
```

### Future Extensions (not implemented now, shaped for)

The history buffer is designed so these can be added without changing the
provider's core API:

- **Undo/redo navigation:** A cursor index into the history. `undo()` restores
  `entries[cursor - 1]` via `update()` with priority `"restore"`. `redo()`
  moves cursor forward. Any new user write resets cursor to head.
- **Last known good state:** If an adapter reports an error (e.g. Cesium globe
  not loaded), the provider can restore `history.nearest(timestampMs - 1000)`
  as a recovery point.
- **View bookmarks:** Snapshot the current state and store it outside the ring
  buffer. Restore later via `update()` with priority `"restore"`.
- **Transition recording:** Record a sequence of keyframes for playback.
  The history buffer already has the right shape for this.

These are NOT part of the initial implementation. The history buffer and
`HistoryView` API are designed to support them without refactoring.

## Provider Implementation Sketch

```typescript
function SceneStateProvider({ children, historyConfig }: Props) {
  // --- State refs (not React state — no re-render on every frame) ---
  const stateRef = useRef<CommonSceneState | null>(null);
  const controllerRef = useRef<ControllerState>({ id: null, priority: "sync", claimedAt: 0 });
  const frameRef = useRef<FrameWriteState>({ frameId: 0, writtenBy: null, writtenAt: 0 });
  const registrationsRef = useRef<Map<string, string>>(new Map()); // id → engine
  const listenersRef = useRef<Set<() => void>>(new Set());
  const historyRef = useRef<RingBuffer<HistoryEntry>>(createRingBuffer(historyConfig));
  const lastHistorySnapshotRef = useRef<number>(0);

  // --- Frame tick (advances frameId, detects stale controller) ---
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      frameRef.current = {
        frameId: frameRef.current.frameId + 1,
        writtenBy: null,
        writtenAt: 0,
      };
      // Stale controller check
      const ctrl = controllerRef.current;
      if (ctrl.id && frameRef.current.frameId - ctrl.lastWriteFrame > 10) {
        controllerRef.current = { id: null, priority: "sync", claimedAt: 0 };
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- update() with all guards ---
  const update = useCallback((next: CommonSceneState, token: WriteToken): WriteResult => {
    // Guard: registered?
    if (!registrationsRef.current.has(token.sourceId)) {
      return { rejected: true, reason: "unregistered-source" };
    }
    // Guard: timestamp monotonic?
    if (token.timestampMs < frameRef.current.writtenAt) {
      return { rejected: true, reason: "stale-timestamp" };
    }
    // Guard: controller check
    const ctrl = controllerRef.current;
    if (ctrl.id && ctrl.id !== token.sourceId && token.priority <= ctrl.priority) {
      return { rejected: true, reason: "not-controller" };
    }
    // Guard: frame already written by different source?
    const frame = frameRef.current;
    if (frame.writtenBy && frame.writtenBy !== token.sourceId) {
      return { rejected: true, reason: "frame-already-written" };
    }

    // Accept
    stateRef.current = Object.freeze(next); // immutable
    frameRef.current = { ...frame, writtenBy: token.sourceId, writtenAt: token.timestampMs };

    // History sampling
    const elapsed = token.timestampMs - lastHistorySnapshotRef.current;
    if (elapsed >= historyConfig.snapshotIntervalMs) {
      historyRef.current.push({ state: next, ...token, frameId: frame.frameId });
      lastHistorySnapshotRef.current = token.timestampMs;
    }

    // Notify subscribers
    listenersRef.current.forEach(fn => fn());
    return { accepted: true, frameId: frame.frameId };
  }, [historyConfig]);

  // --- Context value (stable reference) ---
  const value = useMemo(() => ({
    getState: () => stateRef.current,
    getControllerId: () => controllerRef.current.id,
    subscribe: (fn) => { listenersRef.current.add(fn); return () => listenersRef.current.delete(fn); },
    register: (id, engine) => { registrationsRef.current.set(id, engine); return () => registrationsRef.current.delete(id); },
    update,
    claimControl: (id, priority) => { /* priority check, set controllerRef */ },
    releaseControl: (id) => { /* clear if matches */ },
    getHistory: () => buildHistoryView(historyRef.current),
  }), [update]);

  return <SceneStateContext.Provider value={value}>{children}</SceneStateContext.Provider>;
}
```

## Consumer Hooks

```typescript
// Primary read hook — re-renders on state change via useSyncExternalStore
function useSceneState(): CommonSceneState | null {
  const ctx = useContext(SceneStateContext);
  return useSyncExternalStore(ctx.subscribe, ctx.getState);
}

// Derived values — memoized, re-renders only when derived values change
function useSceneStateDerived(): DerivedSceneState | null {
  const state = useSceneState();
  return useMemo(() => state ? deriveViewAngles(state) : null, [state]);
}

// Adapter registration hook
function useSceneAdapter(options: {
  id: string;
  engine: string;
  read: () => CommonSceneState | null;
  apply: (state: CommonSceneState) => void;
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
}): { isController: boolean; claimControl: () => void };

// History access (does not trigger re-renders)
function useSceneHistory(): HistoryView {
  const ctx = useContext(SceneStateContext);
  return ctx.getHistory();
}
```

## What This Replaces

| Removed | Replaced By |
|---|---|
| `@reduxjs/toolkit` dependency for scene state | `useRef` + `useSyncExternalStore` |
| `configureStore()` × 2 | Provider-internal refs |
| `createSlice()` × 2 | `update()` method with write guards |
| `SerializedSceneState` + serialize/deserialize | Gone. Store holds live objects. |
| Redux DevTools for camera | History ring buffer (structured, queryable) |
| 4 React contexts | 1 context |
| serializableCheck middleware workarounds | Gone. No middleware. |
| Throttle + debounce + stability heuristics in hash sync | Framework moveEnd events |

## Not Specified Here (out of scope)

- Animation controller (SLERP/LERP) — separate spec, consumes this provider
  via `update()` with `priority: "animation"`
- Hash sync component — separate spec, reads from `subscribe()` + framework
  `moveEnd` events, writes hash
- Overlay coupling — explicitly excluded, overlays don't use this provider
- Framework adapter internals — each adapter's `read()`/`apply()` implementation
  is adapter-specific, uses framework APIs directly
