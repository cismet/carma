import type { MutableRefObject } from "react";
import type { TransitionStageTracker } from "./TransitionContext";

export type StageKey = keyof TransitionStageTracker;

/**
 * Mark the start of a transition stage
 */
export const startStage = (
  trackerRef: MutableRefObject<TransitionStageTracker>,
  stage: StageKey
): void => {
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
  stage: StageKey
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
// todo: implement usage or remove
export const failStage = (
  trackerRef: MutableRefObject<TransitionStageTracker>,
  stage: StageKey,
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
  stage: StageKey
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
): Array<{ stage: StageKey; duration: number; error?: Error }> => {
  return Object.entries(trackerRef.current)
    .filter(([, data]) => data && data.endTime)
    .map(([stage, data]) => ({
      stage: stage as StageKey,
      duration: data!.endTime! - data!.startTime,
      error: data!.error,
    }));
};
