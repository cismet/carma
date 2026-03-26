import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ViewState, WritePriority } from "../../core/types";
import {
  useViewAdapter,
  type ViewAdapterHandle,
} from "../providers/view-state/useViewAdapter";
import { useViewStateContext } from "../providers/view-state/useViewState";

const bindInteractionClaiming = (
  element: HTMLElement,
  claimControl: (priority?: WritePriority) => boolean,
  priority: WritePriority
) => {
  const maybeClaim = () => {
    claimControl(priority);
  };

  element.addEventListener("pointerdown", maybeClaim);
  element.addEventListener("wheel", maybeClaim, { passive: true });
  element.addEventListener("touchstart", maybeClaim, { passive: true });

  return () => {
    element.removeEventListener("pointerdown", maybeClaim);
    element.removeEventListener("wheel", maybeClaim);
    element.removeEventListener("touchstart", maybeClaim);
  };
};

export type UseLiveRuntimeBridgeOptions<TRuntime> = {
  id: string;
  engine: string;
  runtime?: TRuntime | null;
  enabled?: boolean;
  pushPriority?: WritePriority;
  claimPriority?: WritePriority;
  claimBeforePush?: boolean;
  claimOnInteraction?: boolean;
  read: (
    runtime: TRuntime,
    sourceId: string,
    seedState: ViewState | null
  ) => ViewState | null;
  apply: (runtime: TRuntime, state: ViewState) => void;
  subscribe: (runtime: TRuntime, listener: () => void) => (() => void) | null;
  getInteractionElement?: (runtime: TRuntime) => HTMLElement | null | undefined;
};

export type LiveRuntimeBridgeHandle = ViewAdapterHandle & {
  publishCurrentState: () => boolean;
  readCurrentState: () => ViewState | null;
};

export const useLiveRuntimeBridge = <TRuntime>({
  id,
  engine,
  runtime = null,
  enabled = true,
  pushPriority = "sync",
  claimPriority = "user-interaction",
  claimBeforePush = true,
  claimOnInteraction = false,
  read,
  apply,
  subscribe,
  getInteractionElement,
}: UseLiveRuntimeBridgeOptions<TRuntime>): LiveRuntimeBridgeHandle => {
  const viewStateContext = useViewStateContext();
  const viewStateContextRef = useRef(viewStateContext);
  viewStateContextRef.current = viewStateContext;

  const adapter = useViewAdapter(id, engine, {
    apply: (state) => {
      if (!runtime) {
        return;
      }

      apply(runtime, state);
    },
  });

  const readCurrentState = useCallback(() => {
    if (!runtime || !enabled) {
      return null;
    }

    return read(runtime, id, viewStateContextRef.current.getState());
  }, [enabled, id, read, runtime]);

  const publishCurrentState = useCallback(() => {
    const nextState = readCurrentState();
    if (!nextState) {
      return false;
    }

    if (claimBeforePush) {
      if (!adapter.claimControl(claimPriority)) {
        return false;
      }
    } else if (!adapter.isController) {
      return false;
    }

    adapter.pushState(nextState, pushPriority);
    return true;
  }, [adapter, claimBeforePush, claimPriority, pushPriority, readCurrentState]);

  useEffect(() => {
    if (!runtime || !enabled) {
      adapter.releaseControl();
      return;
    }

    publishCurrentState();
    const cleanup = subscribe(runtime, publishCurrentState);

    return () => {
      cleanup?.();
      adapter.releaseControl();
    };
  }, [adapter, enabled, publishCurrentState, runtime, subscribe]);

  useEffect(() => {
    if (!runtime || !enabled || !claimOnInteraction || !getInteractionElement) {
      return;
    }

    const element = getInteractionElement(runtime);
    if (!element) {
      return;
    }

    return bindInteractionClaiming(
      element,
      adapter.claimControl,
      claimPriority
    );
  }, [
    adapter.claimControl,
    claimOnInteraction,
    claimPriority,
    enabled,
    getInteractionElement,
    runtime,
  ]);

  return useMemo(
    () => ({
      ...adapter,
      publishCurrentState,
      readCurrentState,
    }),
    [adapter, publishCurrentState, readCurrentState]
  );
};
