import { type MutableRefObject } from "react";
import {
  MapTransitionState,
  type MapTransitionLifecycle,
} from "./TransitionContext";

/**
 * Register a lifecycle handler for a specific transition state
 */
export const addMapTransitionLifecycleHandler = (
  lifecycleRef: MutableRefObject<MapTransitionLifecycle>,
  state:
    | MapTransitionState.preTransitionTo2d
    | MapTransitionState.preTransitionTo3d,
  handler: () => void | Promise<void>
) => {
  lifecycleRef.current = {
    ...lifecycleRef.current,
    [state]: handler,
  };
};

/**
 * Run lifecycle handlers for a given transition state
 */
export const runTransitionLifecycleHandlers = async (
  lifecycleRef: MutableRefObject<MapTransitionLifecycle>,
  state: MapTransitionState
): Promise<void> => {
  const handler = lifecycleRef.current[state as keyof MapTransitionLifecycle];
  if (handler) {
    await handler();
  }
};
