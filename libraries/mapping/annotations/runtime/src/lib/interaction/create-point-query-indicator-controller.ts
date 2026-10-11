import { Matrix4, Vector3 } from "three";
import { color as parseCssColor } from "d3-color";
import {
  shouldRestepScreenScale,
  snapToNiceStep,
  REFERENCE_OBJECT_SCALING_MODES,
  type ReferenceObjectScalingMode,
} from "@carma-commons/math";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  createOrientedDiscMatrix,
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
  resolveStableDiscNormal,
  type CandidateRingSample,
} from "@carma-mapping/annotations/core";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationRingMaterialPreset,
  type AnnotationSceneLineCollection,
  type AnnotationScenePrimitiveHandle,
} from "../engine";
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
  setLineRuntimeColor,
  type AuthoringLineRuntime,
} from "./authoring-visual-runtime";

type PreviewRingQueuedInput = {
  version: number;
};

type PreviewRingColor = {
  colorCss: string;
  opacity: number;
};

export type PointQueryIndicatorSample = {
  pointECEF?: Vector3 | null;
  surfaceNormalECEF?: Vector3 | null;
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
  materialPreset?: AnnotationRingMaterialPreset;
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
  setVisualStyle: (
    style: PointQueryIndicatorVisualStyle,
    options?: { requestRender?: boolean }
  ) => void;
  setPreview: (
    preview: PointQueryIndicatorSample | null,
    options?: { requestRender?: boolean }
  ) => void;
  clearPreview: () => void;
  destroy: () => void;
};

const WHITE_CSS_COLOR = "white";

/** The CSS colour with the opacity baked in, as the line style carries no alpha. */
const resolveCssColorWithAlpha = (
  colorCss: string,
  opacity: number
): string => {
  const parsedColor = parseCssColor(colorCss) ?? parseCssColor(WHITE_CSS_COLOR);
  if (!parsedColor) {
    return `rgba(255,255,255,${opacity})`;
  }

  const { r, g, b } = parsedColor.rgb();
  return `rgba(${[r, g, b].map(Math.round).join(",")},${opacity})`;
};

const safeCall = (callback: (() => void) | null | undefined) => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // Listener removal can race with engine teardown.
  }
};

export const createPointQueryIndicatorController = (
  engine: AnnotationEngine | null,
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
  if (!engine || !isValidAnnotationEngine(engine)) {
    return {
      setEnabled: () => undefined,
      setVisualStyle: () => undefined,
      setPreview: () => undefined,
      clearPreview: () => undefined,
      destroy: () => undefined,
    };
  }
  const activeEngine = engine;

  const previewRingRadius = Math.max(radius, 0.1);
  const averagedNormal = new Vector3();
  const previewRingModelMatrix = new Matrix4();
  const resolvedOpacity =
    typeof opacity === "number" && Number.isFinite(opacity)
      ? opacity
      : pointPreviewRingVisualDefaults.alpha;
  const resolvePreviewRingColor = (
    style?: PointQueryIndicatorVisualStyle
  ): PreviewRingColor => {
    const styleOpacity =
      typeof style?.opacity === "number" && Number.isFinite(style.opacity)
        ? style.opacity
        : resolvedOpacity;
    const styleColor = style?.color ?? color;
    return {
      colorCss: styleColor ?? WHITE_CSS_COLOR,
      opacity: styleOpacity,
    };
  };
  const resolvePreviewRingStyleKey = (ringColor: PreviewRingColor) =>
    resolveCssColorWithAlpha(ringColor.colorCss, ringColor.opacity);

  let enabled = false;
  let previewRingColor = resolvePreviewRingColor();
  let previewRingStyleKey = resolvePreviewRingStyleKey(previewRingColor);
  let previewRing: AnnotationScenePrimitiveHandle | null = null;
  let previewRingNormalLineCollection: AnnotationSceneLineCollection | null =
    null;
  let previewRingNormalLineRuntime: AuthoringLineRuntime | null = null;
  let removePreviewRingFrameListener: (() => void) | null = null;
  let previewRingSmoothingRenderPending = false;
  let previewPoint: Vector3 | null = null;
  // Optional world-radius resizing: the disc keeps a world size, picked so it
  // comes out near the screen target, and changes it only when the view does.
  // The restep test reads the scale at the point the current size was picked
  // at, not at the pointer: a pointer wandering between a near roof and the
  // far ground does not change that scale, a zoom or a camera move does.
  // Steps land on a 1, 2, 5, 10, 20 m diameter series.
  let steppedRadiusMeters: number | null = null;
  let steppedReferenceScale = 0;
  const steppedReferencePoint = new Vector3();
  const DISC_MIN_STEPPED_RADIUS_METERS = 0.1;

  const resolveSteppedRadiusMeters = (center: Vector3): number => {
    const scaleAtReference =
      steppedRadiusMeters === null
        ? 0
        : activeEngine.getScreenPixelsPerMeterAt(steppedReferencePoint);
    if (
      steppedRadiusMeters !== null &&
      !shouldRestepScreenScale(
        steppedReferenceScale,
        scaleAtReference,
        discResizeStepFactor
      )
    ) {
      return steppedRadiusMeters;
    }
    const scaleHere = activeEngine.getScreenPixelsPerMeterAt(center);
    if (!Number.isFinite(scaleHere) || scaleHere <= 0) {
      return steppedRadiusMeters ?? previewRingRadius;
    }
    const continuousRadius = targetScreenRadiusCssPx / scaleHere;
    const radius = quantizeStepWorldRadius
      ? snapToNiceStep(continuousRadius * 2) / 2
      : continuousRadius;
    steppedRadiusMeters = Math.max(radius, DISC_MIN_STEPPED_RADIUS_METERS);
    steppedReferenceScale = scaleHere;
    steppedReferencePoint.copy(center);
    return steppedRadiusMeters;
  };
  let previewSurfaceNormal: Vector3 | null = null;
  let latestTruePreviewPoint: Vector3 | null = null;
  let latestTrueSurfaceNormal: Vector3 | null = null;
  let latestPreviewPointLocked = false;
  let previewInputVersion = 0;
  let previewRingSamples: CandidateRingSample[] = [];
  let previewRingLastQueuedInput: PreviewRingQueuedInput | null = null;

  const clearPreviewRing = () => {
    if (previewRing) {
      previewRing.destroy();
    }
    previewRing = null;
    if (previewRingNormalLineRuntime) {
      clearLineRuntime(previewRingNormalLineRuntime);
    }
    previewRingSamples = [];
    previewRingLastQueuedInput = null;
    previewRingSmoothingRenderPending = false;
    // The stepped size survives a cleared preview: the next one under the
    // same view must not come back in another size.
  };

  const ensurePreviewRingNormalLine = () => {
    if (previewRingNormalLineRuntime) {
      return previewRingNormalLineRuntime;
    }

    if (!previewRingNormalLineCollection) {
      previewRingNormalLineCollection = createLineCollection(activeEngine);
    }

    previewRingNormalLineRuntime = createLineRuntime(
      previewRingNormalLineCollection,
      "measurement-preview-point-ring-normal",
      previewRingStyleKey
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
    setLineRuntimeColor(lineRuntime, previewRingStyleKey);

    // The line runs along the disc normal through its origin; the disc model
    // matrix carries the local Z axis into world space.
    const halfLineLengthMeters = Math.max(lineLengthMeters, 0.1) / 2;
    applyLineRuntime(lineRuntime, [
      new Vector3(0, 0, -halfLineLengthMeters).applyMatrix4(modelMatrix),
      new Vector3(0, 0, halfLineLengthMeters).applyMatrix4(modelMatrix),
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

    const pointerScreenPosition = activeEngine.pointer.getScreenPosition();
    if (!pointerScreenPosition) {
      return latestTruePreviewPoint;
    }

    return (
      resolveTangentDiscPlaneReprojectedWorldPosition({
        engine: activeEngine,
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
      previewRing = activeEngine.createRing({
        id: pointPreviewRingVisualDefaults.primitiveId,
        radius: 1,
        innerRadius: Math.min(Math.max(innerHoleRadiusRatio, 0), 0.999),
        color: previewRingColor.colorCss,
        opacity: previewRingColor.opacity,
        materialPreset:
          materialPreset ?? pointPreviewRingVisualDefaults.materialPreset,
        segments: 20,
        modelMatrix: previewRingModelMatrix,
      });
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

  const queuePreviewSample = (normal: Vector3) => {
    pushCandidateRingSample({
      samples: previewRingSamples,
      normal,
      maxSampleCount: tangentDiscVisualizerTrailSampleCount,
      timestampMs: performance.now(),
    });
  };

  const getAveragedPreviewNormal = (fallbackNormal: Vector3) =>
    getAveragedCandidateRingNormal({
      samples: previewRingSamples,
      fallbackNormal,
      result: averagedNormal,
      epsilonSquared: GUIDE_NORMAL_EPSILON_SQUARED,
      maxSampleAgeMs: tangentDiscVisualizerSmoothingWindowMs,
      weightDecayGamma: tangentDiscVisualizerWeightDecayGamma,
      nowMs: performance.now(),
    });

  const requestPreviewRingSmoothingRender = () => {
    if (
      previewRingSmoothingRenderPending ||
      previewRingSamples.length <= 1 ||
      activeEngine.isDestroyed()
    ) {
      return;
    }

    previewRingSmoothingRenderPending = true;
    activeEngine.requestRender();
  };

  const updatePreviewRing = ({
    requestSmoothingRender = true,
  }: {
    requestSmoothingRender?: boolean;
  } = {}) => {
    if (!enabled) {
      clearPreviewRing();
      return;
    }

    const center = resolveDisplayedPreviewPoint();
    if (!center) {
      clearPreviewRing();
      return;
    }

    previewPoint = (previewPoint ?? new Vector3()).copy(center);
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
            engine: activeEngine,
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
    if (requestSmoothingRender) {
      requestPreviewRingSmoothingRender();
    }
    activeRing.setModelMatrix(
      createOrientedDiscMatrix(
        center,
        averagedPreviewNormal,
        sampledRadius,
        previewRingModelMatrix
      )
    );
    applyPreviewRingNormalLine({
      modelMatrix: previewRingModelMatrix,
      lineLengthMeters: sampledRadius * 2,
    });
  };

  const unregisterPointerTracker = activeEngine.pointer.register();

  // preRender (not postRender): set the ring modelMatrix before the draw so the
  // probe/query disc tracks the cursor on the same frame. The point-query hook
  // owns the coalesced render request for pointer input; this controller only
  // applies the latest tracked position to that frame.
  removePreviewRingFrameListener = activeEngine.subscribePreRender(() => {
    previewRingSmoothingRenderPending = false;
    updatePreviewRing();
  });

  return {
    setEnabled: (nextEnabled) => {
      if (enabled === nextEnabled) {
        return;
      }

      enabled = nextEnabled;
      if (!enabled) {
        clearPreviewRing();
      } else {
        updatePreviewRing({ requestSmoothingRender: false });
      }
      activeEngine.requestRender();
    },
    setVisualStyle: (style, options) => {
      const nextPreviewRingColor = resolvePreviewRingColor(style);
      const nextPreviewRingStyleKey =
        resolvePreviewRingStyleKey(nextPreviewRingColor);
      if (previewRingStyleKey === nextPreviewRingStyleKey) {
        return;
      }

      previewRingColor = nextPreviewRingColor;
      previewRingStyleKey = nextPreviewRingStyleKey;
      clearPreviewRing();
      updatePreviewRing({ requestSmoothingRender: false });
      if (options?.requestRender !== false) {
        activeEngine.requestRender();
      }
    },
    setPreview: (preview, options) => {
      if (!preview?.pointECEF) {
        previewPoint = null;
        previewSurfaceNormal = null;
        latestTruePreviewPoint = null;
        latestTrueSurfaceNormal = null;
        latestPreviewPointLocked = false;
        previewInputVersion += 1;
        clearPreviewRing();
        if (options?.requestRender !== false) {
          activeEngine.requestRender();
        }
        return;
      }

      latestTruePreviewPoint = (latestTruePreviewPoint ?? new Vector3()).copy(
        preview.pointECEF
      );
      previewPoint = (previewPoint ?? new Vector3()).copy(preview.pointECEF);
      latestTrueSurfaceNormal = preview.surfaceNormalECEF
        ? (latestTrueSurfaceNormal ?? new Vector3()).copy(
            preview.surfaceNormalECEF
          )
        : null;
      previewSurfaceNormal = preview.surfaceNormalECEF
        ? (previewSurfaceNormal ?? new Vector3()).copy(
            preview.surfaceNormalECEF
          )
        : null;
      latestPreviewPointLocked = preview.lockToPreviewPoint === true;
      previewInputVersion += 1;
      updatePreviewRing({ requestSmoothingRender: false });
      if (options?.requestRender !== false) {
        activeEngine.requestRender();
      }
    },
    clearPreview: () => {
      previewPoint = null;
      previewSurfaceNormal = null;
      latestTruePreviewPoint = null;
      latestTrueSurfaceNormal = null;
      latestPreviewPointLocked = false;
      previewInputVersion += 1;
      clearPreviewRing();
      activeEngine.requestRender();
    },
    destroy: () => {
      unregisterPointerTracker();
      safeCall(removePreviewRingFrameListener);
      removePreviewRingFrameListener = null;
      clearPreviewRing();
      previewRingNormalLineCollection?.destroy();
      previewRingNormalLineCollection = null;
      previewRingNormalLineRuntime = null;
      previewRingSamples = [];
    },
  };
};
