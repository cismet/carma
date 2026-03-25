import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  appendViewStateHistoryEntry,
  createViewStateHistoryBuffer,
  DEFAULT_HISTORY_CONFIG,
  readViewStateHistory,
} from "./history";
import {
  WRITE_PRIORITY_RANK,
  type CommonViewState,
  type HistoryConfig,
  type HistoryEntry,
  type ViewStateContextValue,
  type WritePriority,
  type WriteResult,
  type WriteToken,
} from "../core/types";
import { ViewStateContext } from "./context";

// ---------------------------------------------------------------------------
// Internal state types
// ---------------------------------------------------------------------------

type ControllerState = {
  id: string | null;
  priority: WritePriority;
  lastWriteFrameId: number;
  claimedAt: number;
};

type FrameWriteState = {
  frameId: number;
  writtenBy: string | null;
  writtenAt: number;
};

// Stale controller timeout: non-interactive controllers may expire if they stop
// writing for this many frames. User-interaction controllers stay latched until
// another source claims control or they explicitly release.
const STALE_CONTROLLER_FRAME_THRESHOLD = 10;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type ViewStateProviderProps = {
  children: ReactNode;
  historyConfig?: Partial<HistoryConfig>;
};

export const ViewStateProvider = ({
  children,
  historyConfig: historyConfigOverride,
}: ViewStateProviderProps) => {
  const historyConfig = useMemo(
    () => ({ ...DEFAULT_HISTORY_CONFIG, ...historyConfigOverride }),
    // Intentionally stable — config doesn't change at runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // --- Core state refs (no React state — subscribers notified manually) ---
  const stateRef = useRef<CommonViewState | null>(null);
  const controllerRef = useRef<ControllerState>({
    id: null,
    priority: "sync",
    lastWriteFrameId: 0,
    claimedAt: 0,
  });
  const frameRef = useRef<FrameWriteState>({
    frameId: 0,
    writtenBy: null,
    writtenAt: 0,
  });
  const registrationsRef = useRef<Map<string, string>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());
  const historyRef = useRef(
    createViewStateHistoryBuffer(historyConfig.maxEntries)
  );
  const lastHistoryTsRef = useRef(0);

  // --- Frame tick via requestAnimationFrame ---
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const frame = frameRef.current;
      frameRef.current = {
        frameId: frame.frameId + 1,
        writtenBy: null,
        writtenAt: 0,
      };

      // Stale controller detection
      const ctrl = controllerRef.current;
      if (
        ctrl.id &&
        ctrl.priority !== "user-interaction" &&
        frameRef.current.frameId - ctrl.lastWriteFrameId >
          STALE_CONTROLLER_FRAME_THRESHOLD
      ) {
        controllerRef.current = {
          id: null,
          priority: "sync",
          lastWriteFrameId: 0,
          claimedAt: 0,
        };
        const listeners = listenersRef.current;
        listeners.forEach((fn) => fn());
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- Registration ---
  const register = useCallback((id: string, engine: string) => {
    registrationsRef.current.set(id, engine);
    return () => {
      registrationsRef.current.delete(id);
      // If this adapter was controller, release
      if (controllerRef.current.id === id) {
        controllerRef.current = {
          id: null,
          priority: "sync",
          lastWriteFrameId: 0,
          claimedAt: 0,
        };
        const listeners = listenersRef.current;
        listeners.forEach((fn) => fn());
      }
    };
  }, []);

  // --- Controller arbitration ---
  const claimControl = useCallback(
    (id: string, priority: WritePriority): boolean => {
      if (!registrationsRef.current.has(id)) return false;

      const ctrl = controllerRef.current;
      const newRank = WRITE_PRIORITY_RANK[priority];
      const currentRank = ctrl.id ? WRITE_PRIORITY_RANK[ctrl.priority] : -1;

      if (ctrl.id === id || newRank >= currentRank || ctrl.id === null) {
        const nextController: ControllerState = {
          id,
          priority,
          lastWriteFrameId: frameRef.current.frameId,
          claimedAt: Date.now(),
        };
        const changed =
          ctrl.id !== nextController.id ||
          ctrl.priority !== nextController.priority;
        controllerRef.current = {
          ...nextController,
        };
        if (changed) {
          const listeners = listenersRef.current;
          listeners.forEach((fn) => fn());
        }
        return true;
      }
      return false;
    },
    []
  );

  const releaseControl = useCallback((id: string) => {
    if (controllerRef.current.id === id) {
      controllerRef.current = {
        id: null,
        priority: "sync",
        lastWriteFrameId: 0,
        claimedAt: 0,
      };
      const listeners = listenersRef.current;
      listeners.forEach((fn) => fn());
    }
  }, []);

  // --- Update with all guards ---
  const update = useCallback(
    (next: CommonViewState, token: WriteToken): WriteResult => {
      // Guard: registered?
      if (!registrationsRef.current.has(token.sourceId)) {
        return { rejected: true, reason: "unregistered-source" };
      }

      // Guard: monotonic timestamp
      if (
        stateRef.current &&
        token.timestampMs < stateRef.current.metadata.timestampMs
      ) {
        return { rejected: true, reason: "stale-timestamp" };
      }

      // Guard: controller check
      const ctrl = controllerRef.current;
      if (ctrl.id && ctrl.id !== token.sourceId) {
        return { rejected: true, reason: "not-controller" };
      }

      // Guard: one writer per frame (same source can overwrite itself)
      const frame = frameRef.current;
      if (frame.writtenBy && frame.writtenBy !== token.sourceId) {
        return { rejected: true, reason: "frame-already-written" };
      }

      // Accept the write
      stateRef.current = next;
      frameRef.current = {
        ...frame,
        writtenBy: token.sourceId,
        writtenAt: token.timestampMs,
      };

      // Update controller tracking
      if (ctrl.id === token.sourceId) {
        controllerRef.current = {
          ...ctrl,
          lastWriteFrameId: frame.frameId,
        };
      }

      // History sampling (interval-based, not every write)
      const elapsed = token.timestampMs - lastHistoryTsRef.current;
      if (
        elapsed >= historyConfig.snapshotIntervalMs ||
        lastHistoryTsRef.current === 0
      ) {
        const entry: HistoryEntry = {
          state: next,
          sourceId: token.sourceId,
          priority: token.priority,
          timestampMs: token.timestampMs,
          frameId: frame.frameId,
        };
        historyRef.current = appendViewStateHistoryEntry(
          historyRef.current,
          entry
        );
        lastHistoryTsRef.current = token.timestampMs;
      }

      // Notify subscribers
      const listeners = listenersRef.current;
      listeners.forEach((fn) => fn());

      return { accepted: true, frameId: frame.frameId };
    },
    [historyConfig.snapshotIntervalMs]
  );

  // --- Subscribe ---
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // --- Reads ---
  const getState = useCallback(() => stateRef.current, []);
  const getControllerId = useCallback(() => controllerRef.current.id, []);
  const getHistory = useCallback(
    () => readViewStateHistory(historyRef.current),
    []
  );

  // --- Stable context value ---
  const value = useMemo<ViewStateContextValue>(
    () => ({
      getState,
      getControllerId,
      subscribe,
      register,
      update,
      claimControl,
      releaseControl,
      getHistory,
    }),
    [
      getState,
      getControllerId,
      subscribe,
      register,
      update,
      claimControl,
      releaseControl,
      getHistory,
    ]
  );

  return (
    <ViewStateContext.Provider value={value}>
      {children}
    </ViewStateContext.Provider>
  );
};
