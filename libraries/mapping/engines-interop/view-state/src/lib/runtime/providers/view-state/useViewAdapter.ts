import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ViewState, WritePriority, WriteToken } from "../../../core/types";
import { useViewStateContext, useViewStateControllerId } from "./useViewState";
export type ViewAdapterCallbacks = {
  apply: (state: ViewState) => void;
};

export type ViewAdapterHandle = {
  isController: boolean;
  claimControl: (priority?: WritePriority) => boolean;
  releaseControl: () => void;
  pushState: (state: ViewState, priority?: WritePriority) => void;
};

export const useViewAdapter = (
  id: string,
  engine: string,
  callbacks: ViewAdapterCallbacks
): ViewAdapterHandle => {
  const ctx = useViewStateContext();
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    return ctx.register(id, engine);
  }, [ctx, id, engine]);

  const controllerId = useViewStateControllerId();
  const isController = controllerId === id;
  const isApplyingRef = useRef(false);

  useEffect(() => {
    const applyLatestSharedState = () => {
      const latestState = ctx.getState();
      const latestControllerId = ctx.getControllerId();
      if (
        !latestControllerId ||
        latestControllerId === id ||
        !latestState ||
        latestState.metadata.sourceId === id ||
        isApplyingRef.current
      ) {
        return;
      }

      isApplyingRef.current = true;
      try {
        callbacksRef.current.apply(latestState);
      } finally {
        isApplyingRef.current = false;
      }
    };

    applyLatestSharedState();
    return ctx.subscribe(applyLatestSharedState);
  }, [ctx, id]);

  const claimControl = useCallback(
    (priority: WritePriority = "user-interaction") => {
      return ctx.claimControl(id, priority);
    },
    [ctx, id]
  );

  const releaseControl = useCallback(() => {
    ctx.releaseControl(id);
  }, [ctx, id]);

  const pushState = useCallback(
    (next: ViewState, priority: WritePriority = "user-interaction") => {
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
