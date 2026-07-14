import { Cartesian3, Color, Matrix4, Primitive } from "@carma-cesium";
import {
  getCesiumScenePointerScreenPosition,
  registerCesiumScenePointerTracker,
  subscribeCesiumScenePointerClientPosition,
} from "@carma-mapping/engines/cesium/react/interactions";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  createOrientedDiscModelMatrix,
  createRing,
  getScreenPixelsPerMeterAtWorldPoint,
  isValidScene,
  registerCesiumScenePickExclusionResolver,
  resolveStableDiscNormal,
  safeCall,
  safeRemovePrimitive,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  createSteppedScreenScaler,
  REFERENCE_OBJECT_SCALING_MODES,
  type ReferenceObjectScalingMode,
} from "@carma-commons/math";
import {
  type CandidateRingSample,
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
} from "@carma-mapping/annotations/core";

import type { Scene } from "@carma-cesium";
import { pointPreviewRingVisualDefaults } from "../config/point-preview-visual-defaults";
import {
  isPointQueryDiscPlaneOffsetPlacementMode,
  POINT_QUERY_DISC_PLACEMENT_MODES,
  type PointQueryDiscPlacementMode,
} from "./point-query-disc-placement-mode";
import { resolvePointQueryDiscRadius } from "./resolve-point-query-disc-radius";
import { resolveTangentDiscPlaneReprojectedWorldPosition } from "./tangent-disc-reprojection.shared";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  destroyLineCollection,
  setLineRuntimeColor,
  type AuthoringLineRuntime,
} from "./authoring-visual-runtime";

type PreviewRingQueuedInput = {
  version: number;
};

export type PointQueryIndicatorSample = {
  pointECEF?: Cartesian3 | null;
  surfaceNormalECEF?: Cartesian3 | null;
  lockToPreviewPoint?: boolean;
};

export type PointQueryIndicatorVisualStyle = {
  color?: string;
  opacity?: number;
} | null;

export type PointQueryIndicatorControllerOptions = {
  radius: number;
  placementMode?: PointQueryDiscPlacementMode;
  color?: string;
  opacity?: number;
  materialPreset?: RingMaterialPreset;
  innerHoleRadiusRatio?: number;
  // `screen`: hold the on-screen size every frame. `world`: fixed metres.
  scalingMode?: ReferenceObjectScalingMode;
  targetScreenRadiusCssPx?: number;
  // In world mode, periodically recalculate the held radius toward the screen
  // target. The step factor controls the permissible apparent-size band.
  resizeWorldRadiusToScreenTarget?: boolean;
  discResizeStepFactor?: number;
  quantizeStepWorldRadius?: boolean;
  showNormalLine?: boolean;
  tangentDiscVisualizerTrailSampleCount?: number;
  tangentDiscVisualizerSmoothingWindowMs?: number;
  tangentDiscVisualizerWeightDecayGamma?: number;
};

export type PointQueryIndicatorController = {
  setEnabled: (enabled: boolean) => void;
  setVisualStyle: (style: PointQueryIndicatorVisualStyle) => void;
  setPreview: (preview: PointQueryIndicatorSample | null) => void;
  clearPreview: () => void;
  destroy: () => void;
};

export const createPointQueryIndicatorController = (
  scene: Scene | null,
  {
    radius,
    placementMode = POINT_QUERY_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT,
    color,
    opacity,
    materialPreset,
    innerHoleRadiusRatio = pointPreviewRingVisualDefaults.innerHoleRadiusRatio,
    scalingMode = pointPreviewRingVisualDefaults.scalingMode,
    targetScreenRadiusCssPx = pointPreviewRingVisualDefaults.targetScreenRadiusCssPx,
    resizeWorldRadiusToScreenTarget = false,
    discResizeStepFactor = 4,
    quantizeStepWorldRadius = false,
    showNormalLine = false,
    tangentDiscVisualizerTrailSampleCount = pointPreviewRingVisualDefaults.smoothingSampleCount,
    tangentDiscVisualizerSmoothingWindowMs = pointPreviewRingVisualDefaults.smoothingWindowMs,
    tangentDiscVisualizerWeightDecayGamma = pointPreviewRingVisualDefaults.smoothingWeightDecayGamma,
  }: PointQueryIndicatorControllerOptions
): PointQueryIndicatorController => {
  if (!scene || !isValidScene(scene)) {
    return {
      setEnabled: () => undefined,
      setVisualStyle: () => undefined,
      setPreview: () => undefined,
      clearPreview: () => undefined,
      destroy: () => undefined,
    };
  }
  const activeScene = scene;

  const previewRingRadius = Math.max(radius, 0.1);
  const averagedNormal = new Cartesian3();
  const resolvedOpacity =
    typeof opacity === "number" && Number.isFinite(opacity)
      ? opacity
      : pointPreviewRingVisualDefaults.alpha;
  const resolvePreviewRingColor = (style?: PointQueryIndicatorVisualStyle) => {
    const styleOpacity =
      typeof style?.opacity === "number" && Number.isFinite(style.opacity)
        ? style.opacity
        : resolvedOpacity;
    const styleColor = style?.color ?? color;
    return styleColor
      ? Color.fromCssColorString(styleColor)?.withAlpha(styleOpacity) ??
          Color.WHITE.withAlpha(styleOpacity)
      : Color.WHITE.withAlpha(styleOpacity);
  };

  let enabled = false;
  let previewRingColor = resolvePreviewRingColor();
  let previewRingStyleKey = previewRingColor.toCssColorString();
  let previewRing: Primitive | null = null;
  let previewRingNormalLineCollection: ReturnType<
    typeof createLineCollection
  > | null = null;
  let previewRingNormalLineRuntime: AuthoringLineRuntime | null = null;
  const unregisterScenePickExclusions =
    registerCesiumScenePickExclusionResolver(activeScene, () =>
      [previewRing].filter(
        (candidate): candidate is object => candidate !== null
      )
    );
  let removePreviewRingFrameListener: (() => void) | null = null;
  let previewPoint: Cartesian3 | null = null;
  // Optional world-radius resizing holds a captured radius across authoring and
  // only recalculates it after a meaningful zoom change.
  const steppedScaler = createSteppedScreenScaler();

  const resolveSteppedRadiusMeters = (center: Cartesian3): number =>
    steppedScaler.resolve({
      currentScale: getScreenPixelsPerMeterAtWorldPoint(activeScene, center),
      targetScreenPx: targetScreenRadiusCssPx,
      fallback: previewRingRadius,
      stepFactor: discResizeStepFactor,
      quantize: quantizeStepWorldRadius,
      minWorldSize: 0.1,
    });
  let previewSurfaceNormal: Cartesian3 | null = null;
  let latestTruePreviewPoint: Cartesian3 | null = null;
  let latestTrueSurfaceNormal: Cartesian3 | null = null;
  let latestPreviewPointLocked = false;
  let previewInputVersion = 0;
  let previewRingSamples: CandidateRingSample[] = [];
  let previewRingLastQueuedInput: PreviewRingQueuedInput | null = null;

  const clearPreviewRing = () => {
    if (previewRing) {
      safeRemovePrimitive(activeScene, previewRing);
    }
    previewRing = null;
    if (previewRingNormalLineRuntime) {
      clearLineRuntime(previewRingNormalLineRuntime);
    }
    previewRingSamples = [];
    previewRingLastQueuedInput = null;
    // Re-capture the stepped size at the next authoring session.
    steppedScaler.reset();
  };

  const ensurePreviewRingNormalLine = () => {
    if (previewRingNormalLineRuntime) {
      return previewRingNormalLineRuntime;
    }

    if (!previewRingNormalLineCollection) {
      previewRingNormalLineCollection = createLineCollection(activeScene);
    }

    previewRingNormalLineRuntime = createLineRuntime(
      previewRingNormalLineCollection,
      "measurement-preview-point-ring-normal",
      previewRingColor.toCssColorString()
    );

    return previewRingNormalLineRuntime;
  };

  const applyPreviewRingNormalLine = ({
    modelMatrix,
    lineLengthMeters,
  }: {
    modelMatrix: Matrix4 | null;
    lineLengthMeters: number;
  }) => {
    if (!showNormalLine || !modelMatrix) {
      if (previewRingNormalLineRuntime) {
        clearLineRuntime(previewRingNormalLineRuntime);
      }
      return;
    }

    const lineRuntime = ensurePreviewRingNormalLine();
    setLineRuntimeColor(lineRuntime, previewRingColor.toCssColorString());
    if (previewRingNormalLineCollection) {
      previewRingNormalLineCollection.modelMatrix = Matrix4.clone(
        modelMatrix,
        previewRingNormalLineCollection.modelMatrix
      );
    }

    const halfLineLengthMeters = Math.max(lineLengthMeters, 0.1) / 2;
    applyLineRuntime(lineRuntime, [
      new Cartesian3(0, 0, -halfLineLengthMeters),
      new Cartesian3(0, 0, halfLineLengthMeters),
    ]);
  };

  const resolveDisplayedPreviewPoint = () => {
    if (!latestTruePreviewPoint) {
      return null;
    }

    if (!isPointQueryDiscPlaneOffsetPlacementMode(placementMode)) {
      return latestTruePreviewPoint;
    }

    if (latestPreviewPointLocked || !latestTrueSurfaceNormal) {
      return latestTruePreviewPoint;
    }

    const pointerScreenPosition =
      getCesiumScenePointerScreenPosition(activeScene);
    if (!pointerScreenPosition) {
      return latestTruePreviewPoint;
    }

    return (
      resolveTangentDiscPlaneReprojectedWorldPosition({
        scene: activeScene,
        screenPosition: pointerScreenPosition,
        tangentPlane: {
          pointECEF: latestTruePreviewPoint,
          normalECEF: latestTrueSurfaceNormal,
        },
      }) ?? latestTruePreviewPoint
    );
  };

  const ensurePreviewRing = () => {
    if (!previewPoint) {
      clearPreviewRing();
      return null;
    }

    if (!previewRing) {
      const nextRing = createRing(pointPreviewRingVisualDefaults.primitiveId, {
        radius: 1,
        innerRadius: Math.min(Math.max(innerHoleRadiusRatio, 0), 0.999),
        color: previewRingColor,
        opacity: previewRingColor.alpha,
        asynchronous: false,
        materialPreset:
          materialPreset ?? pointPreviewRingVisualDefaults.materialPreset,
        segments: 20,
      });
      activeScene.primitives.add(nextRing);
      previewRing = nextRing;
    }

    return previewRing;
  };

  const shouldQueueCurrentPreviewSample = () => {
    const currentInput: PreviewRingQueuedInput = {
      version: previewInputVersion,
    };
    const hasInputChanged =
      !previewRingLastQueuedInput ||
      previewRingLastQueuedInput.version !== currentInput.version;

    if (!hasInputChanged) {
      return false;
    }

    previewRingLastQueuedInput = currentInput;
    return true;
  };

  const queuePreviewSample = (normal: Cartesian3) => {
    pushCandidateRingSample({
      samples: previewRingSamples,
      normal,
      maxSampleCount: tangentDiscVisualizerTrailSampleCount,
      timestampMs: performance.now(),
    });
  };

  const getAveragedPreviewNormal = (fallbackNormal: Cartesian3) =>
    getAveragedCandidateRingNormal({
      samples: previewRingSamples,
      fallbackNormal,
      result: averagedNormal,
      epsilonSquared: GUIDE_NORMAL_EPSILON_SQUARED,
      maxSampleAgeMs: tangentDiscVisualizerSmoothingWindowMs,
      weightDecayGamma: tangentDiscVisualizerWeightDecayGamma,
      nowMs: performance.now(),
    });

  const hasPendingPreviewSmoothing = (nowMs = performance.now()) =>
    previewRingSamples.length > 1 &&
    previewRingSamples.some(
      (sample) =>
        nowMs - sample.timestampMs < tangentDiscVisualizerSmoothingWindowMs
    );

  const updatePreviewRing = () => {
    if (!enabled) {
      clearPreviewRing();
      return;
    }

    const center = resolveDisplayedPreviewPoint();
    if (!center) {
      clearPreviewRing();
      return;
    }

    previewPoint = Cartesian3.clone(center, previewPoint ?? new Cartesian3());
    const discNormal = resolveStableDiscNormal(
      center,
      latestTrueSurfaceNormal ?? previewSurfaceNormal,
      previewSurfaceNormal
    );
    const sampledRadius =
      scalingMode === REFERENCE_OBJECT_SCALING_MODES.WORLD &&
      resizeWorldRadiusToScreenTarget
        ? resolveSteppedRadiusMeters(center)
        : resolvePointQueryDiscRadius({
            scene: activeScene,
            pointECEF: center,
            discNormalECEF: discNormal,
            radiusMeters: previewRingRadius,
            scalingMode,
            targetScreenRadiusCssPx,
          });
    const activeRing = previewRing ?? ensurePreviewRing();
    if (!activeRing) {
      return;
    }

    if (shouldQueueCurrentPreviewSample()) {
      queuePreviewSample(discNormal);
    }
    const averagedPreviewNormal = getAveragedPreviewNormal(discNormal);
    activeRing.modelMatrix = createOrientedDiscModelMatrix(
      center,
      averagedPreviewNormal,
      sampledRadius,
      activeRing.modelMatrix
    );
    applyPreviewRingNormalLine({
      modelMatrix: activeRing.modelMatrix,
      lineLengthMeters: sampledRadius * 2,
    });

    if (hasPendingPreviewSmoothing()) {
      activeScene.requestRender();
    }
  };

  const unregisterPointerTracker =
    registerCesiumScenePointerTracker(activeScene);
  const unsubscribeClientPosition = subscribeCesiumScenePointerClientPosition(
    activeScene,
    () => {
      if (
        !enabled ||
        !latestTruePreviewPoint ||
        latestPreviewPointLocked ||
        !isPointQueryDiscPlaneOffsetPlacementMode(placementMode)
      ) {
        return;
      }

      updatePreviewRing();
      activeScene.requestRender();
    }
  );

  // preRender (not postRender): set the ring modelMatrix before the draw so the
  // probe/query disc tracks the cursor on the same frame, matching the gizmo
  // disc. postRender would draw the new matrix one frame late.
  removePreviewRingFrameListener =
    activeScene.preRender.addEventListener(updatePreviewRing);

  return {
    setEnabled: (nextEnabled) => {
      if (enabled === nextEnabled) {
        return;
      }

      enabled = nextEnabled;
      if (!enabled) {
        clearPreviewRing();
      } else {
        updatePreviewRing();
      }
      activeScene.requestRender();
    },
    setVisualStyle: (style) => {
      const nextPreviewRingColor = resolvePreviewRingColor(style);
      const nextPreviewRingStyleKey = nextPreviewRingColor.toCssColorString();
      if (previewRingStyleKey === nextPreviewRingStyleKey) {
        return;
      }

      previewRingColor = nextPreviewRingColor;
      previewRingStyleKey = nextPreviewRingStyleKey;
      clearPreviewRing();
      updatePreviewRing();
      activeScene.requestRender();
    },
    setPreview: (preview) => {
      if (!preview?.pointECEF) {
        previewPoint = null;
        previewSurfaceNormal = null;
        latestTruePreviewPoint = null;
        latestTrueSurfaceNormal = null;
        latestPreviewPointLocked = false;
        previewInputVersion += 1;
        clearPreviewRing();
        activeScene.requestRender();
        return;
      }

      latestTruePreviewPoint = Cartesian3.clone(
        preview.pointECEF,
        latestTruePreviewPoint ?? new Cartesian3()
      );
      previewPoint = Cartesian3.clone(
        preview.pointECEF,
        previewPoint ?? new Cartesian3()
      );
      latestTrueSurfaceNormal = preview.surfaceNormalECEF
        ? Cartesian3.clone(
            preview.surfaceNormalECEF,
            latestTrueSurfaceNormal ?? new Cartesian3()
          )
        : null;
      previewSurfaceNormal = preview.surfaceNormalECEF
        ? Cartesian3.clone(
            preview.surfaceNormalECEF,
            previewSurfaceNormal ?? new Cartesian3()
          )
        : null;
      latestPreviewPointLocked = preview.lockToPreviewPoint === true;
      previewInputVersion += 1;
      updatePreviewRing();
      activeScene.requestRender();
    },
    clearPreview: () => {
      previewPoint = null;
      previewSurfaceNormal = null;
      latestTruePreviewPoint = null;
      latestTrueSurfaceNormal = null;
      latestPreviewPointLocked = false;
      previewInputVersion += 1;
      clearPreviewRing();
      activeScene.requestRender();
    },
    destroy: () => {
      unsubscribeClientPosition();
      unregisterPointerTracker();
      unregisterScenePickExclusions();
      safeCall(removePreviewRingFrameListener);
      removePreviewRingFrameListener = null;
      clearPreviewRing();
      destroyLineCollection(activeScene, previewRingNormalLineCollection);
      previewRingNormalLineCollection = null;
      previewRingNormalLineRuntime = null;
      previewRingSamples = [];
    },
  };
};
