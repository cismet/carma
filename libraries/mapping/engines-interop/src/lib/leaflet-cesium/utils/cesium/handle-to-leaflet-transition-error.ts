import { TransitionStage } from "../../types";
import type { TransitionToLeafletCallbacks } from "../../types";
import { fadeOutContainer } from "../dom-utils";

export const handleToLeafletTransitionError = (
  error: unknown,
  cesiumContainer: HTMLElement,
  fadeOutDurationMs: number,
  callbacks: Pick<TransitionToLeafletCallbacks, "onStageChange" | "onError">
): void => {
  const err = error instanceof Error ? error : new Error(String(error));
  callbacks.onStageChange(
    TransitionStage.ERROR,
    `Transition failed: ${err.message}`
  );
  console.error("[CESIUM] [CESIUM|2D3D|TO2D] Transition error:", error);

  fadeOutContainer(cesiumContainer, fadeOutDurationMs);

  if (callbacks.onError) {
    callbacks.onError(err);
  }
};
