import { Matrix4, Vector3 } from "three";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_RING_MATERIAL_PRESETS } from "../engine";
import { pointPreviewRingVisualDefaults } from "../config/point-preview-visual-defaults";
import { resolveCrosshairCanvasCursor } from "./resolve-crosshair-canvas-cursor";
import {
  POINT_QUERY_DISC_PLACEMENT_MODES,
  type PointQueryDiscPlacementMode,
} from "./point-query-disc-placement-mode";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  setLineRuntimeColor,
} from "./authoring-visual-runtime";
import type {
  PointQueryControllerRuntime,
  ScreenVector,
} from "./point-query-controller-runtime.types";
import { resolveCssColorWithAlpha } from "./point-query-controller-defaults";

export const createPointQueryControllerVisualRuntime = (
  runtime: PointQueryControllerRuntime
) => {
  const readTangentDiscVisualizerEnabled = () =>
    runtime.currentOptions.tangentDiscVisualizerEnabled ??
    runtime.currentOptions.showDisc ??
    true;

  const readTangentDiscVisualizerPlacementMode =
    (): PointQueryDiscPlacementMode =>
      runtime.currentOptions.tangentDiscVisualizerPlacementMode ??
      POINT_QUERY_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT;

  const readTangentDiscVisualizerShowNormalLine = () =>
    runtime.currentOptions.tangentDiscVisualizerShowNormalLine ?? false;

  const readTangentDiscVisualizerTrailSampleCount = () =>
    Math.max(
      1,
      Math.round(
        runtime.currentOptions.tangentDiscVisualizerTrailSampleCount ??
          pointPreviewRingVisualDefaults.smoothingSampleCount
      )
    );

  const readTangentDiscVisualizerWeightDecayGamma = () =>
    Math.max(
      0.01,
      runtime.currentOptions.tangentDiscVisualizerWeightDecayGamma ??
        pointPreviewRingVisualDefaults.smoothingWeightDecayGamma
    );

  const readDiscPlacementMode = (): PointQueryDiscPlacementMode =>
    runtime.readTangentDiscVisualizerPlacementMode();

  const readInnerHoleRadiusRatio = () =>
    Math.min(
      Math.max(
        runtime.currentOptions.innerHoleRadiusRatio ??
          pointPreviewRingVisualDefaults.innerHoleRadiusRatio,
        0
      ),
      0.999
    );

  const readDebugTelemetryEnabled = () =>
    runtime.currentOptions.debugTelemetryEnabled ??
    runtime.pointQueryDebugRuntime.hasDebugSinks();

  const resolvePointerScreenPositionFromClientPosition = (
    clientPosition: { x: number; y: number } | null
  ) => {
    if (!clientPosition) {
      return null;
    }

    const canvasRect = runtime.engine.canvas.getBoundingClientRect();
    const nextX = clientPosition.x - canvasRect.left;
    const nextY = clientPosition.y - canvasRect.top;
    if (
      nextX < 0 ||
      nextY < 0 ||
      nextX > canvasRect.width ||
      nextY > canvasRect.height
    ) {
      return null;
    }

    const nextScreenPosition = runtime.pointerScreenPositionScratch ?? {
      x: 0,
      y: 0,
    };
    nextScreenPosition.x = nextX;
    nextScreenPosition.y = nextY;
    runtime.pointerScreenPositionScratch = nextScreenPosition;
    return nextScreenPosition;
  };

  const syncDebugLagState = () => {
    runtime.pointQueryDebugRuntime.syncLagState({
      placementMode: runtime.readDiscPlacementMode(),
      latestObservedClientPosition: runtime.latestObservedClientPosition,
      latestRenderedClientPosition: runtime.latestRenderedClientPosition,
      latestDiscClientPosition: runtime.latestDiscClientPosition,
      latestSampleClientPosition: runtime.latestSampleClientPosition,
    });
  };

  const ensureDiscPrimitive = () => {
    if (runtime.discPrimitive) {
      return runtime.discPrimitive;
    }

    const nextDiscPrimitive = runtime.engine.createRing({
      id: "story-cursor-overlay-disc",
      radius: 1,
      innerRadius: runtime.readInnerHoleRadiusRatio(),
      color: runtime.currentOptions.discColor,
      opacity: runtime.currentOptions.discOpacity,
      materialPreset:
        runtime.currentOptions.discMaterialPreset ??
        ANNOTATION_RING_MATERIAL_PRESETS.COLOR,
      segments: 20,
      modelMatrix: runtime.discModelMatrix,
    });
    runtime.discPrimitive = nextDiscPrimitive;
    return nextDiscPrimitive;
  };

  const ensureDiscNormalLineRuntime = () => {
    if (runtime.discNormalLineRuntime) {
      return runtime.discNormalLineRuntime;
    }

    if (!runtime.discNormalLineCollection) {
      runtime.discNormalLineCollection = createLineCollection(runtime.engine);
    }

    runtime.discNormalLineRuntime = createLineRuntime(
      runtime.discNormalLineCollection,
      "story-cursor-overlay-disc-normal",
      resolveCssColorWithAlpha(
        runtime.currentOptions.discColor,
        runtime.currentOptions.discOpacity
      )
    );
    return runtime.discNormalLineRuntime;
  };

  const applyDiscNormalLine = ({
    modelMatrix,
    lineLengthMeters,
  }: {
    modelMatrix: Matrix4 | null;
    lineLengthMeters: number;
  }) => {
    if (!runtime.readTangentDiscVisualizerShowNormalLine()) {
      if (runtime.discNormalLineRuntime) {
        clearLineRuntime(runtime.discNormalLineRuntime);
        runtime.discNormalLineVisible = false;
      }
      return;
    }

    if (!modelMatrix) {
      if (runtime.discNormalLineRuntime) {
        clearLineRuntime(runtime.discNormalLineRuntime);
        runtime.discNormalLineVisible = false;
      }
      return;
    }

    const lineRuntime = runtime.ensureDiscNormalLineRuntime();
    setLineRuntimeColor(
      lineRuntime,
      resolveCssColorWithAlpha(
        runtime.currentOptions.discColor,
        runtime.currentOptions.discOpacity
      )
    );
    // The line runs along the disc normal through its origin; the disc model
    // matrix carries the local Z axis into world space.
    const halfLineLengthMeters = Math.max(lineLengthMeters, 0.1) / 2;
    applyLineRuntime(lineRuntime, [
      new Vector3(0, 0, -halfLineLengthMeters).applyMatrix4(modelMatrix),
      new Vector3(0, 0, halfLineLengthMeters).applyMatrix4(modelMatrix),
    ]);
    runtime.discNormalLineVisible = true;
  };

  const withDiscTemporarilyHidden = <T>(callback: () => T): T => {
    if (runtime.discPrimitive) {
      runtime.discPrimitive.setVisible(false);
    }
    if (runtime.discNormalLineRuntime) {
      runtime.discNormalLineRuntime.line.setVisible(false);
    }
    try {
      return callback();
    } finally {
      if (runtime.discPrimitive) {
        runtime.discPrimitive.setVisible(true);
      }
      if (runtime.discNormalLineRuntime) {
        runtime.discNormalLineRuntime.line.setVisible(
          runtime.discNormalLineVisible
        );
      }
    }
  };

  const clearDiscPrimitive = () => {
    if (runtime.discPrimitive) {
      runtime.discPrimitive.destroy();
      runtime.discPrimitive = null;
    }
    if (runtime.discNormalLineRuntime) {
      clearLineRuntime(runtime.discNormalLineRuntime);
      runtime.discNormalLineVisible = false;
    }
    runtime.pointQueryDebugRuntime.setLatestDiscScaleFactor(null);
    runtime.previousSurfaceNormal = null;
    runtime.latestDiscWorldPosition = null;
    runtime.latestDiscNormal = null;
    runtime.discNormalSamples = [];
    runtime.lastQueuedDiscNormalInputVersion = -1;
  };

  const shouldQueueDiscNormalSample = (inputVersion: number) => {
    if (inputVersion === runtime.lastQueuedDiscNormalInputVersion) {
      return false;
    }

    runtime.lastQueuedDiscNormalInputVersion = inputVersion;
    return true;
  };

  const queueDiscNormalSample = (discNormal: Vector3) => {
    pushCandidateRingSample({
      samples: runtime.discNormalSamples,
      normal: discNormal,
      maxSampleCount: runtime.readTangentDiscVisualizerTrailSampleCount(),
      timestampMs: performance.now(),
    });
  };

  const getAveragedDiscNormal = (fallbackNormal: Vector3) =>
    getAveragedCandidateRingNormal({
      samples: runtime.discNormalSamples,
      fallbackNormal,
      result: runtime.averagedDiscNormalScratch,
      epsilonSquared: GUIDE_NORMAL_EPSILON_SQUARED,
      maxSampleAgeMs: pointPreviewRingVisualDefaults.smoothingWindowMs,
      weightDecayGamma: runtime.readTangentDiscVisualizerWeightDecayGamma(),
      nowMs: performance.now(),
    });

  const applyCursorVisibility = () => {
    runtime.engine.canvas.style.cursor = resolveCrosshairCanvasCursor({
      queryEnabled: runtime.currentOptions.queryEnabled,
      showCursor: runtime.currentOptions.showCursor,
      hideNativeCursor: runtime.currentOptions.hideNativeCursor,
    });
  };

  const resolvePointerScreenPosition = () => {
    return runtime.resolvePointerScreenPositionFromClientPosition(
      runtime.latestInputClientPosition
        ? {
            x: runtime.latestInputClientPosition.x,
            y: runtime.latestInputClientPosition.y,
          }
        : null
    );
  };

  const isSameClientPosition = (
    left: ScreenVector | null,
    right: ScreenVector | null,
    epsilonPx = 0.5
  ) => {
    if (!left || !right) {
      return false;
    }

    return (
      Math.abs(left.x - right.x) <= epsilonPx &&
      Math.abs(left.y - right.y) <= epsilonPx
    );
  };

  return {
    readTangentDiscVisualizerEnabled,
    readTangentDiscVisualizerPlacementMode,
    readTangentDiscVisualizerShowNormalLine,
    readTangentDiscVisualizerTrailSampleCount,
    readTangentDiscVisualizerWeightDecayGamma,
    readDiscPlacementMode,
    readInnerHoleRadiusRatio,
    readDebugTelemetryEnabled,
    resolvePointerScreenPositionFromClientPosition,
    syncDebugLagState,
    ensureDiscPrimitive,
    ensureDiscNormalLineRuntime,
    applyDiscNormalLine,
    withDiscTemporarilyHidden,
    clearDiscPrimitive,
    shouldQueueDiscNormalSample,
    queueDiscNormalSample,
    getAveragedDiscNormal,
    applyCursorVisibility,
    resolvePointerScreenPosition,
    isSameClientPosition,
  };
};
