import type { MutableRefObject } from "react";
import {
  MapTransitionState,
  type TransitionStageTracker,
} from "./TransitionContext";

/**
 * Mark the start of a transition stage.
 * Updates both the transition state and timing metadata.
 */
export const startStage = (
  stateRef: MutableRefObject<MapTransitionState>,
  trackerRef: MutableRefObject<TransitionStageTracker>,
  stage: MapTransitionState
): void => {
  // Update current state
  stateRef.current = stage;

  // Record timing metadata
  trackerRef.current = {
    ...trackerRef.current,
    [stage]: {
      startTime: Date.now(),
    },
  };
};

/**
 * Mark the end of a transition stage
 */
export const endStage = (
  trackerRef: MutableRefObject<TransitionStageTracker>,
  stage: MapTransitionState
): void => {
  const current = trackerRef.current[stage];
  if (current) {
    trackerRef.current = {
      ...trackerRef.current,
      [stage]: {
        ...current,
        endTime: Date.now(),
      },
    };
  }
};

/**
 * Mark a stage as failed with an error
 */
export const failStage = (
  trackerRef: MutableRefObject<TransitionStageTracker>,
  stage: MapTransitionState,
  error: Error
): void => {
  const current = trackerRef.current[stage];
  if (current) {
    trackerRef.current = {
      ...trackerRef.current,
      [stage]: {
        ...current,
        error,
        endTime: Date.now(),
      },
    };
  }
};

/**
 * Get duration of a completed stage in milliseconds
 */
export const getStageDuration = (
  trackerRef: MutableRefObject<TransitionStageTracker>,
  stage: MapTransitionState
): number | null => {
  const stageData = trackerRef.current[stage];
  if (!stageData || !stageData.endTime) return null;
  return stageData.endTime - stageData.startTime;
};

/**
 * Get all completed stages with their durations
 */
export const getCompletedStages = (
  trackerRef: MutableRefObject<TransitionStageTracker>
): Array<{ stage: MapTransitionState; duration: number; error?: Error }> => {
  return Object.entries(trackerRef.current)
    .filter(([, data]) => data && data.endTime)
    .map(([stage, data]) => ({
      stage: stage as MapTransitionState,
      duration: data!.endTime! - data!.startTime,
      error: data!.error,
    }));
};
