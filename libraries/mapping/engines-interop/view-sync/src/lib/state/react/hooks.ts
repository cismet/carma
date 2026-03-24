import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { ViewStateContext } from "./context";
import { deriveView } from "../core/derivations";
import type {
  CommonViewState,
  DerivedView,
  HistoryView,
  ViewStateContextValue,
  WritePriority,
  WriteToken,
} from "../core/types";

// ---------------------------------------------------------------------------
// Context access
// ---------------------------------------------------------------------------

const useViewStateContext = (): ViewStateContextValue => {
  const ctx = useContext(ViewStateContext);
  if (!ctx) {
    throw new Error(
      "useViewState* hooks require a <ViewStateProvider> ancestor."
    );
  }
  return ctx;
};

// ---------------------------------------------------------------------------
// Primary read hook — tear-free via useSyncExternalStore
// ---------------------------------------------------------------------------

/**
 * Read the current CommonViewState. Re-renders when state changes.
 * Returns null if no state has been written yet.
 */
export const useViewState = (): CommonViewState | null => {
  const ctx = useViewStateContext();
  return useSyncExternalStore(ctx.subscribe, ctx.getState);
};

// ---------------------------------------------------------------------------
// Derived view — memoized angle/zoom projection
// ---------------------------------------------------------------------------

/**
 * Derive flat view angles (bearing, pitch, roll, zoom, etc.) from the
 * current CommonViewState. Re-renders only when the underlying state changes.
 */
export const useViewStateDerived = (): DerivedView | null => {
  const state = useViewState();
  return useMemo(() => (state ? deriveView(state) : null), [state]);
};

// ---------------------------------------------------------------------------
// Controller ID
// ---------------------------------------------------------------------------

export const useViewStateControllerId = (): string | null => {
  const ctx = useViewStateContext();
  return useSyncExternalStore(ctx.subscribe, ctx.getControllerId);
};

// ---------------------------------------------------------------------------
// Adapter registration hook
// ---------------------------------------------------------------------------

export type ViewAdapterCallbacks = {
  /** Read current camera from framework → CommonViewState. */
  read: () => CommonViewState | null;
  /** Apply CommonViewState → framework camera. */
  apply: (state: CommonViewState) => void;
};

export type ViewAdapterHandle = {
  isController: boolean;
  claimControl: () => void;
  releaseControl: () => void;
  /** Push a state update from this adapter. */
  pushState: (state: CommonViewState, priority?: WritePriority) => void;
};

/**
 * Register a framework adapter with the view state provider.
 *
 * The adapter must provide:
 * - `read()`: extract CommonViewState from framework camera
 * - `apply()`: apply CommonViewState to framework camera
 *
 * The hook handles:
 * - Registration/unregistration lifecycle
 * - Applying state from other adapters when not controlling
 * - Providing `pushState()` for forwarding framework camera changes
 */
export const useViewAdapter = (
  id: string,
  engine: string,
  callbacks: ViewAdapterCallbacks
): ViewAdapterHandle => {
  const ctx = useViewStateContext();
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Register on mount, unregister on unmount
  useEffect(() => {
    return ctx.register(id, engine);
  }, [ctx, id, engine]);

  // Apply incoming state when we're NOT the controller
  const state = useViewState();
  const controllerId = useViewStateControllerId();
  const isController = controllerId === id;
  const isApplyingRef = useRef(false);

  useEffect(() => {
    if (
      !controllerId ||
      isController ||
      !state ||
      state.metadata.sourceId === id ||
      isApplyingRef.current
    ) {
      return;
    }
    isApplyingRef.current = true;
    try {
      callbacksRef.current.apply(state);
    } finally {
      isApplyingRef.current = false;
    }
  }, [controllerId, id, isController, state]);

  const claimControl = useCallback(() => {
    ctx.claimControl(id, "user-interaction");
  }, [ctx, id]);

  const releaseControl = useCallback(() => {
    ctx.releaseControl(id);
  }, [ctx, id]);

  const pushState = useCallback(
    (next: CommonViewState, priority: WritePriority = "user-interaction") => {
      const token: WriteToken = {
        sourceId: id,
        timestampMs: Date.now(),
        priority,
      };
      ctx.update(next, token);
    },
    [ctx, id]
  );

  return useMemo(
    () => ({
      isController,
      claimControl,
      releaseControl,
      pushState,
    }),
    [isController, claimControl, releaseControl, pushState]
  );
};

// ---------------------------------------------------------------------------
// History access (does not trigger re-renders on state change)
// ---------------------------------------------------------------------------

/**
 * Access the view state history buffer. Call `getHistory()` to get a
 * snapshot of the current history — this is a read on demand, not reactive.
 */
export const useViewHistory = (): (() => HistoryView) => {
  const ctx = useViewStateContext();
  return ctx.getHistory;
};
