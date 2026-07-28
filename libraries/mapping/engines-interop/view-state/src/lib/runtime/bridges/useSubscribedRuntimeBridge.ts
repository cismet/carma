import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  useViewAdapter,
  type ViewAdapterHandle,
} from "../providers/view-state/useViewAdapter";
import { useViewStateContext } from "../providers/view-state/useViewState";
import type { ViewState, WritePriority } from "../../core/types";
const bindInteractionHandling = (
  element: HTMLElement,
  options: {
    claimControl?: (priority?: WritePriority) => boolean;
    priority: WritePriority;
    onInteraction?: () => void;
  }
) => {
  const handleInteraction = () => {
    options.onInteraction?.();
    options.claimControl?.(options.priority);
  };

  element.addEventListener("pointerdown", handleInteraction);
  element.addEventListener("wheel", handleInteraction, { passive: true });
  element.addEventListener("touchstart", handleInteraction, { passive: true });

  return () => {
    element.removeEventListener("pointerdown", handleInteraction);
    element.removeEventListener("wheel", handleInteraction);
    element.removeEventListener("touchstart", handleInteraction);
  };
};

export type UseSubscribedRuntimeBridgeOptions<TRuntime> = {
  id: string;
  engine: string;
  runtime?: TRuntime | null;
  enabled?: boolean;
  pushPriority?: WritePriority;
  claimPriority?: WritePriority;
  claimBeforePush?: boolean;
  claimOnInteraction?: boolean;
  onInteraction?: () => void;
  read: (
    runtime: TRuntime,
    sourceId: string,
    seedState: ViewState | null
  ) => ViewState | null;
  apply: (runtime: TRuntime, state: ViewState) => void;
  subscribe: (runtime: TRuntime, listener: () => void) => (() => void) | null;
  getInteractionElement?: (runtime: TRuntime) => HTMLElement | null | undefined;
};

export type SubscribedRuntimeBridgeHandle = ViewAdapterHandle & {
  publishCurrentState: () => boolean;
  readCurrentState: () => ViewState | null;
};

export const useSubscribedRuntimeBridge = <TRuntime>({
  id,
  engine,
  runtime = null,
  enabled = true,
  pushPriority = "sync",
  claimPriority = "user-interaction",
  claimBeforePush = true,
  claimOnInteraction = false,
  onInteraction,
  read,
  apply,
  subscribe,
  getInteractionElement,
}: UseSubscribedRuntimeBridgeOptions<TRuntime>): SubscribedRuntimeBridgeHandle => {
  const viewStateContext = useViewStateContext();
  const viewStateContextRef = useRef(viewStateContext);
  viewStateContextRef.current = viewStateContext;
  const readRef = useRef(read);
  const applyRef = useRef(apply);
  const subscribeRef = useRef(subscribe);
  const getInteractionElementRef = useRef(getInteractionElement);
  const onInteractionRef = useRef(onInteraction);
  const enabledRef = useRef(enabled);
  const wasEnabledRef = useRef(false);

  readRef.current = read;
  applyRef.current = apply;
  subscribeRef.current = subscribe;
  getInteractionElementRef.current = getInteractionElement;
  onInteractionRef.current = onInteraction;
  enabledRef.current = enabled;

  const adapter = useViewAdapter(id, engine, {
    apply: (state) => {
      if (!runtime || !enabledRef.current) {
        return;
      }

      applyRef.current(runtime, state);
    },
  });

  const readCurrentState = useCallback(() => {
    if (!runtime || !enabled) {
      return null;
    }

    return readRef.current(runtime, id, viewStateContextRef.current.getState());
  }, [enabled, id, runtime]);

  const publishCurrentState = useCallback(() => {
    const nextState = readCurrentState();
    if (!nextState) {
      return false;
    }

    if (claimBeforePush) {
      if (!adapter.claimControl(claimPriority)) {
        return false;
      }
    } else if (viewStateContextRef.current.getControllerId() !== id) {
      return false;
    }

    adapter.pushState(nextState, pushPriority);
    return true;
  }, [
    adapter.claimControl,
    adapter.pushState,
    claimBeforePush,
    claimPriority,
    id,
    pushPriority,
    readCurrentState,
  ]);

  const releaseControl = adapter.releaseControl;

  useEffect(() => {
    if (!runtime || !enabled) {
      wasEnabledRef.current = false;
      return;
    }

    if (!wasEnabledRef.current) {
      const latestState = viewStateContextRef.current.getState();
      if (latestState && latestState.metadata.sourceId !== id) {
        applyRef.current(runtime, latestState);
      }
    }
    wasEnabledRef.current = true;

    publishCurrentState();
    const cleanup = subscribeRef.current(runtime, publishCurrentState);

    return () => {
      cleanup?.();
    };
  }, [enabled, id, publishCurrentState, runtime]);

  // Release ownership only when the bridge is inactive, not on every
  // subscribe effect re-run (which happens during controller transitions).
  useEffect(() => {
    if (runtime && enabled) {
      return;
    }
    releaseControl();
  }, [enabled, releaseControl, runtime]);

  useEffect(() => {
    return () => {
      releaseControl();
    };
  }, [releaseControl]);

  useEffect(() => {
    if (
      !runtime ||
      !enabled ||
      (!claimOnInteraction && !onInteraction) ||
      !getInteractionElement
    ) {
      return;
    }

    const element = getInteractionElementRef.current?.(runtime);
    if (!element) {
      return;
    }

    return bindInteractionHandling(element, {
      claimControl: claimOnInteraction ? adapter.claimControl : undefined,
      priority: claimPriority,
      onInteraction: onInteractionRef.current,
    });
  }, [
    adapter.claimControl,
    claimOnInteraction,
    claimPriority,
    enabled,
    onInteraction,
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
