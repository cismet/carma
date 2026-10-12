import { Matrix4, Vector3 } from "three";
import {
  REFERENCE_OBJECT_SCALING_MODES,
  type ReferenceObjectScalingMode,
} from "@carma-commons/math";
import {
  createOrientedDiscMatrix,
  resolveStableDiscNormal,
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationRingMaterialPreset,
  type AnnotationScenePrimitiveHandle,
} from "@carma-mapping/annotations/core";

import { pointPreviewRingVisualDefaults } from "../config/point-preview-visual-defaults";
import {
  createDiscNormalLine,
  resolveCssColorWithAlpha,
} from "./disc-normal-line";
import { createDiscNormalSmoother } from "./disc-normal-smoother";
import { finiteOr } from "./finite-or";
import {
  isPointQueryDiscPlaneOffsetPlacementMode,
  POINT_QUERY_DISC_PLACEMENT_MODES,
  type PointQueryDiscPlacementMode,
} from "./point-query-disc-placement-mode";
import {
  clampInnerHoleRadiusRatio,
  resolvePointQueryDiscRadius,
} from "./resolve-point-query-disc-radius";
import { createSteppedDiscRadius } from "./stepped-disc-radius";
import { resolveTangentDiscPlaneReprojectedWorldPosition } from "./tangent-disc-reprojection.shared";

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
  /** `screen` holds the on-screen size every frame, `world` a fixed size in metres. */
  scalingMode?: ReferenceObjectScalingMode;
  targetScreenRadiusCssPx?: number;
  /** In world mode, periodically re-pick the radius toward the screen target. */
  resizeWorldRadiusToScreenTarget?: boolean;
  /** The permissible apparent-size band before the radius is re-picked. */
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
  const previewRingModelMatrix = new Matrix4();
  const resolvedOpacity = finiteOr(
    opacity,
    pointPreviewRingVisualDefaults.alpha
  );
  const resolvePreviewRingColor = (
    style?: PointQueryIndicatorVisualStyle
  ): PreviewRingColor => ({
    colorCss: style?.color ?? color ?? WHITE_CSS_COLOR,
    opacity: finiteOr(style?.opacity, resolvedOpacity),
  });
  const resolvePreviewRingStyleKey = (ringColor: PreviewRingColor) =>
    resolveCssColorWithAlpha(ringColor.colorCss, ringColor.opacity);

  let enabled = false;
  let previewRingColor = resolvePreviewRingColor();
  let previewRingStyleKey = resolvePreviewRingStyleKey(previewRingColor);
  let previewRing: AnnotationScenePrimitiveHandle | null = null;
  const normalLine = createDiscNormalLine(
    activeEngine,
    "measurement-preview-point-ring-normal"
  );
  const normalSmoother = createDiscNormalSmoother(() => ({
    maxSampleCount: tangentDiscVisualizerTrailSampleCount,
    maxSampleAgeMs: tangentDiscVisualizerSmoothingWindowMs,
    weightDecayGamma: tangentDiscVisualizerWeightDecayGamma,
  }));
  let removePreviewRingFrameListener: (() => void) | null = null;
  let previewRingSmoothingRenderPending = false;
  let previewPoint: Vector3 | null = null;
  const resolveSteppedRadiusMeters = createSteppedDiscRadius({
    engine: activeEngine,
    stepFactor: discResizeStepFactor,
    targetScreenRadiusCssPx,
    quantize: quantizeStepWorldRadius,
    fallbackRadiusMeters: previewRingRadius,
  });
  let previewSurfaceNormal: Vector3 | null = null;
  let latestTruePreviewPoint: Vector3 | null = null;
  let latestTrueSurfaceNormal: Vector3 | null = null;
  let latestPreviewPointLocked = false;
  let previewInputVersion = 0;
  let lastQueuedInputVersion: number | null = null;

  const clearPreviewRing = () => {
    previewRing?.destroy();
    previewRing = null;
    normalLine.clear();
    normalSmoother.clear();
    lastQueuedInputVersion = null;
    previewRingSmoothingRenderPending = false;
    // The stepped radius survives a cleared preview: the next one under the
    // same view must not come back in another size.
  };

  const resolveDisplayedPreviewPoint = () => {
    if (!latestTruePreviewPoint) {
      return null;
    }

    if (
      !isPointQueryDiscPlaneOffsetPlacementMode(placementMode) ||
      latestPreviewPointLocked ||
      !latestTrueSurfaceNormal
    ) {
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

    previewRing ??= activeEngine.createRing({
      id: pointPreviewRingVisualDefaults.primitiveId,
      radius: 1,
      innerRadius: clampInnerHoleRadiusRatio(innerHoleRadiusRatio),
      color: previewRingColor.colorCss,
      opacity: previewRingColor.opacity,
      materialPreset:
        materialPreset ?? pointPreviewRingVisualDefaults.materialPreset,
      segments: 20,
      modelMatrix: previewRingModelMatrix,
    });

    return previewRing;
  };

  const requestPreviewRingSmoothingRender = () => {
    if (
      previewRingSmoothingRenderPending ||
      !normalSmoother.hasTrail() ||
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

    if (lastQueuedInputVersion !== previewInputVersion) {
      lastQueuedInputVersion = previewInputVersion;
      normalSmoother.push(discNormal);
    }
    const averagedPreviewNormal = normalSmoother.average(discNormal);
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
    normalLine.apply(
      showNormalLine
        ? {
            modelMatrix: previewRingModelMatrix,
            lineLengthMeters: sampledRadius * 2,
            colorCss: previewRingStyleKey,
          }
        : null
    );
  };

  const resetPreview = () => {
    previewPoint = null;
    previewSurfaceNormal = null;
    latestTruePreviewPoint = null;
    latestTrueSurfaceNormal = null;
    latestPreviewPointLocked = false;
    previewInputVersion += 1;
    clearPreviewRing();
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
        resetPreview();
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
      resetPreview();
      activeEngine.requestRender();
    },
    destroy: () => {
      unregisterPointerTracker();
      safeCall(removePreviewRingFrameListener);
      removePreviewRingFrameListener = null;
      clearPreviewRing();
      normalLine.destroy();
    },
  };
};
