import { Matrix4, Vector3 } from "three";
import { color as parseCssColor } from "d3-color";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  createOrientedDiscMatrix,
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
  resolveStableDiscNormal,
  type CandidateRingSample,
} from "@carma-mapping/annotations/core";

import {
  ANNOTATION_RING_MATERIAL_PRESETS,
  type AnnotationEngine,
  type AnnotationSceneLineCollection,
  type AnnotationScenePrimitiveHandle,
} from "../engine";
import { pointPreviewRingVisualDefaults } from "../config/point-preview-visual-defaults";
import { resolveCrosshairCanvasCursor } from "./resolve-crosshair-canvas-cursor";
import {
  isPointQueryDiscPlaneOffsetPlacementMode,
  POINT_QUERY_DISC_PLACEMENT_MODES,
  type PointQueryDiscPlacementMode,
} from "./point-query-disc-placement-mode";
import { resolvePointQueryDiscRadius } from "./resolve-point-query-disc-radius";
import {
  resolveTangentDiscPlaneReprojectedWorldPosition,
  type TangentDiscSamplePlane,
} from "./tangent-disc-reprojection.shared";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  setLineRuntimeColor,
  type AuthoringLineRuntime,
} from "./authoring-visual-runtime";
import {
  createPointQueryDebugRuntime,
  formatPointQueryReadout as formatReadout,
} from "./point-query-debug-runtime";
import {
  type PointQueryController,
  type PointQueryControllerOptions,
  type PointQueryTangentPlaneFailure,
  type PointQueryTangentPlaneFailureReason,
  POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS,
} from "./point-query-controller.types";

export {
  POINT_QUERY_DISC_PLACEMENT_MODES,
  type PointQueryDiscPlacementMode,
} from "./point-query-disc-placement-mode";
export {
  POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS,
  type PointQueryController,
  type PointQueryControllerOptions,
  type PointQueryControllerTelemetrySnapshot,
  type PointQueryDiscOriginJump,
  type PointQueryDiscScaleChange,
  type PointQueryTelemetryEntry,
  type PointQueryTangentPlaneFailure,
  type PointQueryTangentPlaneFailureReason,
} from "./point-query-controller.types";

type ScreenVector = {
  x: number;
  y: number;
};

type PreparedDiscSample = {
  inputVersion: number;
  screenPosition: ScreenVector;
  pickedPositionECEF: Vector3 | null;
  surfaceNormalECEF: Vector3 | null;
};

type PendingDiscRequest = {
  inputVersion: number;
  requestedAtMs: number;
  requestClientPosition: ScreenVector;
  requestSampleClientPosition: ScreenVector | null;
};

const pointQueryControllerDefaults = Object.freeze({
  performance: Object.freeze({
    reportIntervalMs: 250,
    maxRenderRequestRateHz: 0,
  }),
  sampling: Object.freeze({
    trueSampleRefreshIntervalMs: 32,
    trueNormalRefreshIntervalMs: 96,
    maxFastSampleOffsetPx: 6,
    rawPointerFallbackWindowMs: 12,
  }),
});

/** The disc colour with the disc opacity baked in, for the normal line style. */
const resolveCssColorWithAlpha = (
  colorCss: string,
  opacity: number
): string => {
  const parsedColor = parseCssColor(colorCss) ?? parseCssColor("white");
  if (!parsedColor) {
    return `rgba(255,255,255,${opacity})`;
  }

  const { r, g, b } = parsedColor.rgb();
  return `rgba(${[r, g, b].map(Math.round).join(",")},${opacity})`;
};

export const createPointQueryController = ({
  engine,
  readoutElement,
  mousePositionRateElement,
  renderRequestRateElement,
  sampleRateElement,
  discUpdateRateElement,
  skippedInputRateElement,
  lagReadoutElement,
  syncReadoutElement,
  requestTimingReadoutElement,
  tangentPlaneFailureReadoutElement,
  discOriginJumpReadoutElement,
  discScaleChangeReadoutElement,
  onTangentPlaneFailure,
  options,
}: {
  engine: AnnotationEngine;
  readoutElement: HTMLElement | null;
  mousePositionRateElement?: HTMLElement | null;
  renderRequestRateElement?: HTMLElement | null;
  sampleRateElement?: HTMLElement | null;
  discUpdateRateElement?: HTMLElement | null;
  skippedInputRateElement?: HTMLElement | null;
  lagReadoutElement?: HTMLElement | null;
  syncReadoutElement?: HTMLElement | null;
  requestTimingReadoutElement?: HTMLElement | null;
  tangentPlaneFailureReadoutElement?: HTMLElement | null;
  discOriginJumpReadoutElement?: HTMLElement | null;
  discScaleChangeReadoutElement?: HTMLElement | null;
  onTangentPlaneFailure?: (failure: PointQueryTangentPlaneFailure) => void;
  options: PointQueryControllerOptions;
}): PointQueryController => {
  const unregisterPointerTracker = engine.pointer.register();

  let currentOptions = options;
  let discPrimitive: AnnotationScenePrimitiveHandle | null = null;
  const discModelMatrix = new Matrix4();
  let discNormalLineCollection: AnnotationSceneLineCollection | null = null;
  let discNormalLineRuntime: AuthoringLineRuntime | null = null;
  let discNormalLineVisible = false;
  let discInputNeedsRender = false;
  let discSmoothingNeedsRender = false;
  let previousSurfaceNormal: Vector3 | null = null;
  let latestDiscWorldPosition: Vector3 | null = null;
  let latestDiscNormal: Vector3 | null = null;
  let latestTrueDiscSampledAtMs = 0;
  let latestTrueDiscNormalSampledAtMs = 0;
  let discNormalSamples: CandidateRingSample[] = [];
  let lastQueuedDiscNormalInputVersion = -1;
  let pointerScreenPositionScratch: ScreenVector | null = null;
  const averagedDiscNormalScratch = new Vector3();
  let latestObservedClientPosition: {
    x: number;
    y: number;
    timestampMs: number;
  } | null = null;
  let latestInputClientPosition: {
    x: number;
    y: number;
    timestampMs: number;
  } | null = null;
  let latestRenderedClientPosition: ScreenVector | null = null;
  let latestDiscClientPosition: ScreenVector | null = null;
  let latestSampleClientPosition: ScreenVector | null = null;
  let latestRequestedClientPosition: ScreenVector | null = null;
  let latestRequestedSampleClientPosition: ScreenVector | null = null;
  let latestPreparedDiscSample: PreparedDiscSample | null = null;
  let latestTrueDiscWorldPosition: Vector3 | null = null;
  let latestRequestedAtMs = 0;
  let latestRenderedAtMs = 0;
  let latestRequestToDiscLatencyMs = 0;
  let latestInputVersion = 0;
  let lastProcessedInputVersion = 0;
  let lastRawPointerEventTimeMs = 0;
  // The visible disc stays responsive through fast tangent-plane reprojection,
  // so authoritative mesh picks can run at a lower cadence and only catch up
  // when drift becomes noticeable.
  const rawPointerSupported = "onpointerrawupdate" in window;
  const pendingDiscRequests = new Map<number, PendingDiscRequest>();
  const projectedDiscScreenPositionScratch: ScreenVector = { x: 0, y: 0 };
  const projectedSampleScreenPositionScratch: ScreenVector = { x: 0, y: 0 };
  const readTangentDiscVisualizerEnabled = () =>
    currentOptions.tangentDiscVisualizerEnabled ??
    currentOptions.showDisc ??
    true;
  const readTangentDiscVisualizerPlacementMode =
    (): PointQueryDiscPlacementMode =>
      currentOptions.tangentDiscVisualizerPlacementMode ??
      POINT_QUERY_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT;
  const readTangentDiscVisualizerShowNormalLine = () =>
    currentOptions.tangentDiscVisualizerShowNormalLine ?? false;
  const readTangentDiscVisualizerTrailSampleCount = () =>
    Math.max(
      1,
      Math.round(
        currentOptions.tangentDiscVisualizerTrailSampleCount ??
          pointPreviewRingVisualDefaults.smoothingSampleCount
      )
    );
  const readTangentDiscVisualizerWeightDecayGamma = () =>
    Math.max(
      0.01,
      currentOptions.tangentDiscVisualizerWeightDecayGamma ??
        pointPreviewRingVisualDefaults.smoothingWeightDecayGamma
    );
  const readDiscPlacementMode = (): PointQueryDiscPlacementMode =>
    readTangentDiscVisualizerPlacementMode();
  const readInnerHoleRadiusRatio = () =>
    Math.min(
      Math.max(
        currentOptions.innerHoleRadiusRatio ??
          pointPreviewRingVisualDefaults.innerHoleRadiusRatio,
        0
      ),
      0.999
    );
  const pointQueryDebugRuntime = createPointQueryDebugRuntime({
    engine,
    statusElements: {
      readoutElement,
      mousePositionRateElement,
      renderRequestRateElement,
      sampleRateElement,
      discUpdateRateElement,
      skippedInputRateElement,
      lagReadoutElement,
      syncReadoutElement,
      requestTimingReadoutElement,
      tangentPlaneFailureReadoutElement,
      discOriginJumpReadoutElement,
      discScaleChangeReadoutElement,
    },
    onTangentPlaneFailure,
  });
  const readDebugTelemetryEnabled = () =>
    currentOptions.debugTelemetryEnabled ??
    pointQueryDebugRuntime.hasDebugSinks();

  const resolvePointerScreenPositionFromClientPosition = (
    clientPosition: { x: number; y: number } | null
  ) => {
    if (!clientPosition) {
      return null;
    }

    const canvasRect = engine.canvas.getBoundingClientRect();
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

    const nextScreenPosition = pointerScreenPositionScratch ?? { x: 0, y: 0 };
    nextScreenPosition.x = nextX;
    nextScreenPosition.y = nextY;
    pointerScreenPositionScratch = nextScreenPosition;
    return nextScreenPosition;
  };

  const syncDebugLagState = () => {
    pointQueryDebugRuntime.syncLagState({
      placementMode: readDiscPlacementMode(),
      latestObservedClientPosition,
      latestRenderedClientPosition,
      latestDiscClientPosition,
      latestSampleClientPosition,
    });
  };

  const ensureDiscPrimitive = () => {
    if (discPrimitive) {
      return discPrimitive;
    }

    const nextDiscPrimitive = engine.createRing({
      id: "story-cursor-overlay-disc",
      radius: 1,
      innerRadius: readInnerHoleRadiusRatio(),
      color: currentOptions.discColor,
      opacity: currentOptions.discOpacity,
      materialPreset:
        currentOptions.discMaterialPreset ??
        ANNOTATION_RING_MATERIAL_PRESETS.COLOR,
      segments: 20,
      modelMatrix: discModelMatrix,
    });
    discPrimitive = nextDiscPrimitive;
    return nextDiscPrimitive;
  };

  const ensureDiscNormalLineRuntime = () => {
    if (discNormalLineRuntime) {
      return discNormalLineRuntime;
    }

    if (!discNormalLineCollection) {
      discNormalLineCollection = createLineCollection(engine);
    }

    discNormalLineRuntime = createLineRuntime(
      discNormalLineCollection,
      "story-cursor-overlay-disc-normal",
      resolveCssColorWithAlpha(
        currentOptions.discColor,
        currentOptions.discOpacity
      )
    );
    return discNormalLineRuntime;
  };

  const applyDiscNormalLine = ({
    modelMatrix,
    lineLengthMeters,
  }: {
    modelMatrix: Matrix4 | null;
    lineLengthMeters: number;
  }) => {
    if (!readTangentDiscVisualizerShowNormalLine()) {
      if (discNormalLineRuntime) {
        clearLineRuntime(discNormalLineRuntime);
        discNormalLineVisible = false;
      }
      return;
    }

    if (!modelMatrix) {
      if (discNormalLineRuntime) {
        clearLineRuntime(discNormalLineRuntime);
        discNormalLineVisible = false;
      }
      return;
    }

    const lineRuntime = ensureDiscNormalLineRuntime();
    setLineRuntimeColor(
      lineRuntime,
      resolveCssColorWithAlpha(
        currentOptions.discColor,
        currentOptions.discOpacity
      )
    );
    // The line runs along the disc normal through its origin; the disc model
    // matrix carries the local Z axis into world space.
    const halfLineLengthMeters = Math.max(lineLengthMeters, 0.1) / 2;
    applyLineRuntime(lineRuntime, [
      new Vector3(0, 0, -halfLineLengthMeters).applyMatrix4(modelMatrix),
      new Vector3(0, 0, halfLineLengthMeters).applyMatrix4(modelMatrix),
    ]);
    discNormalLineVisible = true;
  };

  // The disc stays visible whenever it exists; only the normal line toggles.
  const withDiscTemporarilyHidden = <T>(callback: () => T): T => {
    if (discPrimitive) {
      discPrimitive.setVisible(false);
    }
    if (discNormalLineRuntime) {
      discNormalLineRuntime.line.setVisible(false);
    }
    try {
      return callback();
    } finally {
      if (discPrimitive) {
        discPrimitive.setVisible(true);
      }
      if (discNormalLineRuntime) {
        discNormalLineRuntime.line.setVisible(discNormalLineVisible);
      }
    }
  };

  const clearDiscPrimitive = () => {
    if (discPrimitive) {
      discPrimitive.destroy();
      discPrimitive = null;
    }
    if (discNormalLineRuntime) {
      clearLineRuntime(discNormalLineRuntime);
      discNormalLineVisible = false;
    }
    pointQueryDebugRuntime.setLatestDiscScaleFactor(null);
    previousSurfaceNormal = null;
    latestDiscWorldPosition = null;
    latestDiscNormal = null;
    discNormalSamples = [];
    lastQueuedDiscNormalInputVersion = -1;
  };

  const shouldQueueDiscNormalSample = (inputVersion: number) => {
    if (inputVersion === lastQueuedDiscNormalInputVersion) {
      return false;
    }

    lastQueuedDiscNormalInputVersion = inputVersion;
    return true;
  };

  const queueDiscNormalSample = (discNormal: Vector3) => {
    pushCandidateRingSample({
      samples: discNormalSamples,
      normal: discNormal,
      maxSampleCount: readTangentDiscVisualizerTrailSampleCount(),
      timestampMs: performance.now(),
    });
  };

  const getAveragedDiscNormal = (fallbackNormal: Vector3) =>
    getAveragedCandidateRingNormal({
      samples: discNormalSamples,
      fallbackNormal,
      result: averagedDiscNormalScratch,
      epsilonSquared: GUIDE_NORMAL_EPSILON_SQUARED,
      maxSampleAgeMs: pointPreviewRingVisualDefaults.smoothingWindowMs,
      weightDecayGamma: readTangentDiscVisualizerWeightDecayGamma(),
      nowMs: performance.now(),
    });

  const updateReadout = (
    screenPosition: { x: number; y: number } | null,
    pickedPositionECEF: Vector3 | null
  ) => {
    if (!readoutElement) {
      return;
    }

    readoutElement.textContent = formatReadout(
      screenPosition,
      pickedPositionECEF
    );
  };
  const markMousePositionEvent = () => {
    pointQueryDebugRuntime.markMousePositionEvent();
  };

  const markRenderRequestEvent = () => {
    pointQueryDebugRuntime.markRenderRequestEvent();
  };

  const requestNormalSmoothingRender = () => {
    if (
      engine.isDestroyed() ||
      discNormalSamples.length <= 1 ||
      discInputNeedsRender ||
      discSmoothingNeedsRender
    ) {
      return;
    }

    discSmoothingNeedsRender = true;
    markRenderRequestEvent();
    engine.requestRender();
  };

  const markSampleEvent = () => {
    pointQueryDebugRuntime.markSampleEvent();
  };

  const markDiscUpdateEvent = () => {
    pointQueryDebugRuntime.markDiscUpdateEvent();
  };

  const markSkippedInputEvents = (count: number) => {
    pointQueryDebugRuntime.markSkippedInputEvents(count);
  };

  const recordTelemetryEntry = () => {
    pointQueryDebugRuntime.recordTelemetryEntry({
      latestInputVersion,
      lastProcessedInputVersion,
      latestRequestedAtMs,
      latestRenderedAtMs,
      latestClientPosition: latestObservedClientPosition,
      latestRenderedClientPosition,
      latestDiscClientPosition,
      latestSampleClientPosition,
      latestRequestedClientPosition,
      latestRequestedSampleClientPosition,
    });
  };

  const recordTangentPlaneFailure = ({
    inputVersion,
    reason,
    clientPosition,
    screenPosition,
    hasSampledPoint,
    hasSampledSurfaceNormal,
  }: {
    inputVersion: number;
    reason: PointQueryTangentPlaneFailureReason;
    clientPosition: ScreenVector | null;
    screenPosition: ScreenVector | null;
    hasSampledPoint: boolean;
    hasSampledSurfaceNormal: boolean;
  }) => {
    const pendingRequest = pendingDiscRequests.get(inputVersion) ?? null;
    pointQueryDebugRuntime.recordTangentPlaneFailure({
      inputVersion,
      reason,
      requestedAtMs:
        pendingRequest?.requestedAtMs ??
        latestRequestedAtMs ??
        performance.now(),
      placementMode: readDiscPlacementMode(),
      hasLatestTrueDiscWorldPosition: Boolean(latestTrueDiscWorldPosition),
      hasLatestDiscNormal: Boolean(latestDiscNormal),
      clientPosition,
      screenPosition,
      hasSampledPoint,
      hasSampledSurfaceNormal,
    });
  };

  const recordDiscOriginJump = ({
    inputVersion,
    requestedAtMs,
    nextDiscWorldPosition,
    nextDiscNormal,
    nextClientPosition,
    source,
  }: {
    inputVersion: number;
    requestedAtMs: number;
    nextDiscWorldPosition: Vector3;
    nextDiscNormal: Vector3;
    nextClientPosition: ScreenVector | null;
    source: "true-sample" | "fast-reproject";
  }) => {
    pointQueryDebugRuntime.recordDiscOriginJump({
      inputVersion,
      requestedAtMs,
      placementMode: readDiscPlacementMode(),
      previousDiscWorldPosition: latestDiscWorldPosition,
      source,
      nextDiscWorldPosition,
      nextClientPosition,
      nextDiscNormal,
      previousClientPosition: latestDiscClientPosition,
    });
  };

  const recordDiscScaleChange = ({
    inputVersion,
    requestedAtMs,
    nextScaleFactor,
    source,
  }: {
    inputVersion: number;
    requestedAtMs: number;
    nextScaleFactor: number;
    source: "true-sample" | "fast-reproject";
  }) => {
    pointQueryDebugRuntime.recordDiscScaleChange({
      inputVersion,
      requestedAtMs,
      placementMode: readDiscPlacementMode(),
      source,
      nextScaleFactor,
    });
  };

  const resolveClientPositionFromWorldPosition = ({
    worldPosition,
    canvasRect,
    fallbackScreenPosition,
    scratchScreenPosition,
  }: {
    worldPosition: Vector3 | null;
    canvasRect: DOMRect;
    fallbackScreenPosition: ScreenVector | null;
    scratchScreenPosition: ScreenVector;
  }): ScreenVector | null => {
    if (worldPosition) {
      const projectedScreenPosition = engine.worldToScreen(
        worldPosition,
        scratchScreenPosition
      );
      if (projectedScreenPosition) {
        return {
          x: canvasRect.left + projectedScreenPosition.x,
          y: canvasRect.top + projectedScreenPosition.y,
        };
      }
    }

    if (!fallbackScreenPosition) {
      return null;
    }

    return {
      x: canvasRect.left + fallbackScreenPosition.x,
      y: canvasRect.top + fallbackScreenPosition.y,
    };
  };

  const updateObservedClientPosition = ({ x, y }: { x: number; y: number }) => {
    latestObservedClientPosition = {
      x,
      y,
      timestampMs: performance.now(),
    };
    syncDebugLagState();
  };

  const applyCursorVisibility = () => {
    engine.canvas.style.cursor = resolveCrosshairCanvasCursor({
      queryEnabled: currentOptions.queryEnabled,
      showCursor: currentOptions.showCursor,
      hideNativeCursor: currentOptions.hideNativeCursor,
    });
  };

  const resolvePointerScreenPosition = () => {
    return resolvePointerScreenPositionFromClientPosition(
      latestInputClientPosition
        ? {
            x: latestInputClientPosition.x,
            y: latestInputClientPosition.y,
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

  const sampleTrueDiscAtCurrentPointer = ({
    sampleSurfaceNormal,
  }: {
    sampleSurfaceNormal: boolean;
  }): PreparedDiscSample | null => {
    const pointerScreenPosition = resolvePointerScreenPosition();
    if (!pointerScreenPosition) {
      recordTangentPlaneFailure({
        inputVersion: latestInputVersion,
        reason:
          POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_SCREEN_POSITION,
        clientPosition: latestInputClientPosition
          ? {
              x: latestInputClientPosition.x,
              y: latestInputClientPosition.y,
            }
          : null,
        screenPosition: null,
        hasSampledPoint: false,
        hasSampledSurfaceNormal: false,
      });
      return null;
    }

    const resolvedPick = withDiscTemporarilyHidden(() =>
      engine.resolveSurfacePick(pointerScreenPosition, {
        resolveGlobePosition: false,
      })
    );
    markSampleEvent();
    const pickedPositionECEF = resolvedPick.surfacePositionECEF
      ? resolvedPick.surfacePositionECEF.clone()
      : null;
    const sampledSurfaceNormalECEF =
      sampleSurfaceNormal && pickedPositionECEF
        ? withDiscTemporarilyHidden(() =>
            engine.sampleSurfaceNormalAt(
              pointerScreenPosition,
              pickedPositionECEF
            )
          )
        : null;
    const surfaceNormalECEF =
      sampledSurfaceNormalECEF ??
      (previousSurfaceNormal ? previousSurfaceNormal.clone() : null);

    if (!pickedPositionECEF) {
      recordTangentPlaneFailure({
        inputVersion: latestInputVersion,
        reason: POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS,
        clientPosition: latestInputClientPosition
          ? {
              x: latestInputClientPosition.x,
              y: latestInputClientPosition.y,
            }
          : null,
        screenPosition: {
          x: pointerScreenPosition.x,
          y: pointerScreenPosition.y,
        },
        hasSampledPoint: false,
        hasSampledSurfaceNormal: false,
      });
      return null;
    } else if (sampleSurfaceNormal && !sampledSurfaceNormalECEF) {
      recordTangentPlaneFailure({
        inputVersion: latestInputVersion,
        reason: POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_NORMAL_MISS,
        clientPosition: latestInputClientPosition
          ? {
              x: latestInputClientPosition.x,
              y: latestInputClientPosition.y,
            }
          : null,
        screenPosition: {
          x: pointerScreenPosition.x,
          y: pointerScreenPosition.y,
        },
        hasSampledPoint: true,
        hasSampledSurfaceNormal: false,
      });
    }

    return {
      inputVersion: latestInputVersion,
      screenPosition: {
        x: pointerScreenPosition.x,
        y: pointerScreenPosition.y,
      },
      pickedPositionECEF,
      surfaceNormalECEF: surfaceNormalECEF ? surfaceNormalECEF.clone() : null,
    };
  };

  const shouldRefreshTrueDiscSample = (nowMs: number) =>
    !isPointQueryDiscPlaneOffsetPlacementMode(readDiscPlacementMode()) ||
    !latestTrueDiscWorldPosition ||
    !latestDiscNormal ||
    pointQueryDebugRuntime.readLatestSampleOffsetPx() >=
      pointQueryControllerDefaults.sampling.maxFastSampleOffsetPx ||
    nowMs - latestTrueDiscSampledAtMs >=
      pointQueryControllerDefaults.sampling.trueSampleRefreshIntervalMs;

  const shouldRefreshTrueDiscNormal = (nowMs: number) =>
    !latestDiscNormal ||
    pointQueryDebugRuntime.readLatestSampleOffsetPx() >=
      pointQueryControllerDefaults.sampling.maxFastSampleOffsetPx ||
    nowMs - latestTrueDiscNormalSampledAtMs >=
      pointQueryControllerDefaults.sampling.trueNormalRefreshIntervalMs;

  const consumeRenderedRequestMetrics = (
    inputVersion: number,
    renderedAtMs: number
  ) => {
    const requestMetrics = pendingDiscRequests.get(inputVersion) ?? null;
    if (requestMetrics) {
      latestRenderedAtMs = renderedAtMs;
      latestRequestedAtMs = requestMetrics.requestedAtMs;
      latestRequestToDiscLatencyMs = Math.max(
        latestRenderedAtMs - requestMetrics.requestedAtMs,
        0
      );
      latestRequestedClientPosition = requestMetrics.requestClientPosition;
      latestRequestedSampleClientPosition =
        requestMetrics.requestSampleClientPosition;
      latestRenderedClientPosition =
        requestMetrics.requestSampleClientPosition ??
        requestMetrics.requestClientPosition;
      pointQueryDebugRuntime.updateRequestToDiscLatencyMs(
        latestRequestToDiscLatencyMs
      );
    }

    for (const pendingInputVersion of pendingDiscRequests.keys()) {
      if (pendingInputVersion <= inputVersion) {
        pendingDiscRequests.delete(pendingInputVersion);
      }
    }

    return requestMetrics;
  };

  const applyRenderedDiscSample = ({
    renderDiscSample,
    truePickedPositionECEF,
    trueSampledSurfaceNormal,
    renderedAtMs,
  }: {
    renderDiscSample: PreparedDiscSample;
    truePickedPositionECEF: Vector3 | null;
    trueSampledSurfaceNormal: Vector3 | null;
    renderedAtMs: number;
  }) => {
    const pointerScreenPosition = renderDiscSample.screenPosition;
    const renderDiscPositionECEF = renderDiscSample.pickedPositionECEF;

    updateReadout(pointerScreenPosition, renderDiscPositionECEF);
    const skippedInputCount = Math.max(
      latestInputVersion - lastProcessedInputVersion - 1,
      0
    );
    markSkippedInputEvents(skippedInputCount);
    lastProcessedInputVersion = latestInputVersion;
    const requestMetrics = consumeRenderedRequestMetrics(
      renderDiscSample.inputVersion,
      renderedAtMs
    );

    if (!readTangentDiscVisualizerEnabled() || !renderDiscPositionECEF) {
      clearDiscPrimitive();
      syncDebugLagState();
      markDiscUpdateEvent();
      recordTelemetryEntry();
      return;
    }

    previousSurfaceNormal = trueSampledSurfaceNormal
      ? (previousSurfaceNormal ?? new Vector3()).copy(trueSampledSurfaceNormal)
      : previousSurfaceNormal;

    if (
      truePickedPositionECEF &&
      shouldQueueDiscNormalSample(renderDiscSample.inputVersion)
    ) {
      const trueDiscNormal = resolveStableDiscNormal(
        truePickedPositionECEF,
        trueSampledSurfaceNormal ?? null,
        previousSurfaceNormal
      );
      queueDiscNormalSample(trueDiscNormal);
    }

    const fallbackNormal =
      renderDiscSample.surfaceNormalECEF ??
      latestDiscNormal ??
      previousSurfaceNormal;
    const discNormal = resolveStableDiscNormal(
      renderDiscPositionECEF,
      renderDiscSample.surfaceNormalECEF ?? null,
      fallbackNormal ?? null
    );
    const averagedDiscNormal = getAveragedDiscNormal(discNormal);
    requestNormalSmoothingRender();
    const discRadius = Math.max(currentOptions.discRadiusMeters, 0.1);
    const sampledRadius = resolvePointQueryDiscRadius({
      engine,
      pointECEF: renderDiscPositionECEF,
      discNormalECEF: averagedDiscNormal,
      radiusMeters: discRadius,
      scalingMode: currentOptions.discScalingMode,
      targetScreenRadiusCssPx:
        currentOptions.targetScreenRadiusCssPx ??
        pointPreviewRingVisualDefaults.targetScreenRadiusCssPx,
    });
    const activeDiscPrimitive = ensureDiscPrimitive();
    activeDiscPrimitive.setModelMatrix(
      createOrientedDiscMatrix(
        renderDiscPositionECEF,
        averagedDiscNormal,
        sampledRadius,
        discModelMatrix
      )
    );
    applyDiscNormalLine({
      modelMatrix: discModelMatrix,
      lineLengthMeters: sampledRadius * 2,
    });
    recordDiscScaleChange({
      inputVersion: renderDiscSample.inputVersion,
      requestedAtMs: requestMetrics?.requestedAtMs ?? renderedAtMs,
      nextScaleFactor: sampledRadius,
      source: "true-sample",
    });
    recordDiscOriginJump({
      inputVersion: renderDiscSample.inputVersion,
      source: "true-sample",
      nextDiscWorldPosition: renderDiscPositionECEF,
      nextClientPosition: pointerScreenPosition,
      nextDiscNormal: averagedDiscNormal,
      requestedAtMs: requestMetrics?.requestedAtMs ?? renderedAtMs,
    });
    previousSurfaceNormal = (previousSurfaceNormal ?? new Vector3()).copy(
      averagedDiscNormal
    );
    latestDiscWorldPosition = (latestDiscWorldPosition ?? new Vector3()).copy(
      renderDiscPositionECEF
    );
    latestDiscNormal = (latestDiscNormal ?? new Vector3()).copy(
      averagedDiscNormal
    );
    const canvasRect = engine.canvas.getBoundingClientRect();
    latestDiscClientPosition = resolveClientPositionFromWorldPosition({
      worldPosition: renderDiscPositionECEF,
      canvasRect,
      fallbackScreenPosition: pointerScreenPosition,
      scratchScreenPosition: projectedDiscScreenPositionScratch,
    });
    latestSampleClientPosition = resolveClientPositionFromWorldPosition({
      worldPosition: truePickedPositionECEF,
      canvasRect,
      fallbackScreenPosition: truePickedPositionECEF
        ? pointerScreenPosition
        : null,
      scratchScreenPosition: projectedSampleScreenPositionScratch,
    });
    if (requestMetrics && latestSampleClientPosition) {
      latestRequestedSampleClientPosition = { ...latestSampleClientPosition };
    }
    syncDebugLagState();
    markDiscUpdateEvent();
    recordTelemetryEntry();
  };

  // Fast-path rule:
  // only move the disc immediately when we already have a tangent plane from a
  // real mesh sample. The tangent plane is the last true sampled mesh point plus
  // the latest smoothed disc normal. If that plane does not exist yet, we skip
  // the local reprojection step and wait for the regular true sample path.
  const resolveLatestTrueTangentPlane = (): TangentDiscSamplePlane | null => {
    if (!latestTrueDiscWorldPosition || !latestDiscNormal) {
      return null;
    }

    return {
      pointECEF: latestTrueDiscWorldPosition,
      normalECEF: latestDiscNormal,
    };
  };

  const applyFastReprojectedDiscSample = ({
    renderDiscSample,
    renderedAtMs,
  }: {
    renderDiscSample: PreparedDiscSample;
    renderedAtMs: number;
  }) => {
    const pointerScreenPosition = renderDiscSample.screenPosition;
    const renderDiscPositionECEF = renderDiscSample.pickedPositionECEF;

    updateReadout(pointerScreenPosition, renderDiscPositionECEF);
    const skippedInputCount = Math.max(
      latestInputVersion - lastProcessedInputVersion - 1,
      0
    );
    markSkippedInputEvents(skippedInputCount);
    lastProcessedInputVersion = latestInputVersion;
    const requestMetrics = consumeRenderedRequestMetrics(
      renderDiscSample.inputVersion,
      renderedAtMs
    );

    if (!readTangentDiscVisualizerEnabled() || !renderDiscPositionECEF) {
      clearDiscPrimitive();
      syncDebugLagState();
      markDiscUpdateEvent();
      recordTelemetryEntry();
      return;
    }

    // The immediate local update only changes the visible position.
    // The displayed orientation keeps using the latest smoothed normal until the
    // next true sample updates depth and surface normal again.
    const stableDiscNormal = resolveStableDiscNormal(
      latestTrueDiscWorldPosition ?? renderDiscPositionECEF,
      latestDiscNormal ?? null,
      previousSurfaceNormal
    );
    const discRadius = Math.max(currentOptions.discRadiusMeters, 0.1);
    const sampledRadius = resolvePointQueryDiscRadius({
      engine,
      pointECEF: renderDiscPositionECEF,
      discNormalECEF: stableDiscNormal,
      radiusMeters: discRadius,
      scalingMode: currentOptions.discScalingMode,
      targetScreenRadiusCssPx:
        currentOptions.targetScreenRadiusCssPx ??
        pointPreviewRingVisualDefaults.targetScreenRadiusCssPx,
    });
    const activeDiscPrimitive = ensureDiscPrimitive();
    activeDiscPrimitive.setModelMatrix(
      createOrientedDiscMatrix(
        renderDiscPositionECEF,
        stableDiscNormal,
        sampledRadius,
        discModelMatrix
      )
    );
    applyDiscNormalLine({
      modelMatrix: discModelMatrix,
      lineLengthMeters: sampledRadius * 2,
    });
    recordDiscScaleChange({
      inputVersion: renderDiscSample.inputVersion,
      requestedAtMs: requestMetrics?.requestedAtMs ?? renderedAtMs,
      nextScaleFactor: sampledRadius,
      source: "fast-reproject",
    });
    recordDiscOriginJump({
      inputVersion: renderDiscSample.inputVersion,
      source: "fast-reproject",
      nextDiscWorldPosition: renderDiscPositionECEF,
      nextClientPosition: pointerScreenPosition,
      nextDiscNormal: stableDiscNormal,
      requestedAtMs: requestMetrics?.requestedAtMs ?? renderedAtMs,
    });
    latestDiscWorldPosition = (latestDiscWorldPosition ?? new Vector3()).copy(
      renderDiscPositionECEF
    );
    const canvasRect = engine.canvas.getBoundingClientRect();
    latestDiscClientPosition = resolveClientPositionFromWorldPosition({
      worldPosition: renderDiscPositionECEF,
      canvasRect,
      fallbackScreenPosition: pointerScreenPosition,
      scratchScreenPosition: projectedDiscScreenPositionScratch,
    });
    latestSampleClientPosition = resolveClientPositionFromWorldPosition({
      worldPosition: latestTrueDiscWorldPosition,
      canvasRect,
      fallbackScreenPosition: null,
      scratchScreenPosition: projectedSampleScreenPositionScratch,
    });
    if (requestMetrics && latestSampleClientPosition) {
      latestRequestedSampleClientPosition = { ...latestSampleClientPosition };
    }
    syncDebugLagState();
    markDiscUpdateEvent();
    recordTelemetryEntry();
  };

  const prepareFastDiscSample = (
    inputVersion: number,
    clientPosition: ScreenVector | null
  ): PreparedDiscSample | null => {
    const screenPosition =
      resolvePointerScreenPositionFromClientPosition(clientPosition);
    if (!screenPosition) {
      recordTangentPlaneFailure({
        inputVersion,
        reason:
          POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_SCREEN_POSITION,
        clientPosition,
        screenPosition: null,
        hasSampledPoint: false,
        hasSampledSurfaceNormal: false,
      });
      return null;
    }

    const tangentPlane = resolveLatestTrueTangentPlane();
    if (!tangentPlane) {
      recordTangentPlaneFailure({
        inputVersion,
        reason: latestTrueDiscWorldPosition
          ? POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_NORMAL
          : POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_POINT,
        clientPosition,
        screenPosition: {
          x: screenPosition.x,
          y: screenPosition.y,
        },
        hasSampledPoint: Boolean(latestTrueDiscWorldPosition),
        hasSampledSurfaceNormal: Boolean(latestDiscNormal),
      });
      return null;
    }

    const reprojectedWorldPosition =
      resolveTangentDiscPlaneReprojectedWorldPosition({
        engine,
        screenPosition,
        tangentPlane,
      });
    if (!reprojectedWorldPosition) {
      recordTangentPlaneFailure({
        inputVersion,
        reason: POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.REPROJECTION_MISS,
        clientPosition,
        screenPosition: {
          x: screenPosition.x,
          y: screenPosition.y,
        },
        hasSampledPoint: true,
        hasSampledSurfaceNormal: Boolean(latestDiscNormal),
      });
      return null;
    }

    return {
      inputVersion,
      screenPosition: { x: screenPosition.x, y: screenPosition.y },
      pickedPositionECEF: reprojectedWorldPosition.clone(),
      surfaceNormalECEF: latestDiscNormal ? latestDiscNormal.clone() : null,
    };
  };

  const prepareDisplayedDiscSampleForSmoothing = (
    inputVersion: number
  ): PreparedDiscSample | null => {
    const screenPosition = resolvePointerScreenPosition();
    const displayedDiscWorldPosition =
      latestDiscWorldPosition ?? latestTrueDiscWorldPosition;
    if (!screenPosition || !displayedDiscWorldPosition) {
      return null;
    }

    return {
      inputVersion,
      screenPosition: { x: screenPosition.x, y: screenPosition.y },
      pickedPositionECEF: displayedDiscWorldPosition.clone(),
      surfaceNormalECEF: latestDiscNormal ? latestDiscNormal.clone() : null,
    };
  };

  const renderDiscAndReadout = ({
    allowTrueSample,
  }: {
    allowTrueSample: boolean;
  }) => {
    if (!currentOptions.queryEnabled) {
      clearDiscPrimitive();
      updateReadout(null, null);
      syncDebugLagState();
      return;
    }

    const nowMs = performance.now();
    const placementMode = readDiscPlacementMode();
    const shouldUseFastReproject =
      isPointQueryDiscPlaneOffsetPlacementMode(placementMode);

    let trueDiscSample: PreparedDiscSample | null = null;
    let renderDiscSample: PreparedDiscSample | null = null;

    if (allowTrueSample && shouldRefreshTrueDiscSample(nowMs)) {
      trueDiscSample = sampleTrueDiscAtCurrentPointer({
        sampleSurfaceNormal: shouldRefreshTrueDiscNormal(nowMs),
      });
      if (trueDiscSample?.pickedPositionECEF) {
        latestTrueDiscWorldPosition = (
          latestTrueDiscWorldPosition ?? new Vector3()
        ).copy(trueDiscSample.pickedPositionECEF);
        latestTrueDiscSampledAtMs = nowMs;
        if (trueDiscSample.surfaceNormalECEF) {
          latestTrueDiscNormalSampledAtMs = nowMs;
        }
      }
    }

    if (!allowTrueSample) {
      renderDiscSample =
        prepareDisplayedDiscSampleForSmoothing(latestInputVersion);
    } else if (trueDiscSample) {
      renderDiscSample = trueDiscSample;
      latestPreparedDiscSample = null;
    } else if (shouldUseFastReproject) {
      renderDiscSample =
        latestPreparedDiscSample &&
        latestPreparedDiscSample.inputVersion === latestInputVersion
          ? latestPreparedDiscSample
          : null;

      if (!renderDiscSample) {
        renderDiscSample = prepareFastDiscSample(
          latestInputVersion,
          latestInputClientPosition
            ? {
                x: latestInputClientPosition.x,
                y: latestInputClientPosition.y,
              }
            : null
        );
      }
    } else {
      renderDiscSample =
        prepareDisplayedDiscSampleForSmoothing(latestInputVersion);
    }

    if (!renderDiscSample) {
      clearDiscPrimitive();
      updateReadout(null, null);
      syncDebugLagState();
      return;
    }
    const pointerScreenPosition = renderDiscSample.screenPosition;
    const pickedPositionECEF = renderDiscSample.pickedPositionECEF;
    const truePickedPositionECEF =
      trueDiscSample?.pickedPositionECEF ?? latestTrueDiscWorldPosition;
    applyRenderedDiscSample({
      renderDiscSample: {
        ...renderDiscSample,
        screenPosition: pointerScreenPosition,
        pickedPositionECEF,
      },
      truePickedPositionECEF,
      trueSampledSurfaceNormal: trueDiscSample?.surfaceNormalECEF ?? null,
      renderedAtMs: nowMs,
    });
  };

  const requestRenderOnly = () => {
    if (engine.isDestroyed()) {
      return;
    }

    markRenderRequestEvent();
    engine.requestRender();
  };

  const requestRenderNow = () => {
    if (engine.isDestroyed()) {
      return;
    }

    discInputNeedsRender = true;
    discSmoothingNeedsRender = false;
    requestRenderOnly();
  };

  const queueRender = () => {
    requestRenderNow();
  };

  const clearPointer = () => {
    latestObservedClientPosition = null;
    latestInputClientPosition = null;
    latestRenderedClientPosition = null;
    latestDiscClientPosition = null;
    latestSampleClientPosition = null;
    latestRequestedClientPosition = null;
    latestRequestedSampleClientPosition = null;
    latestPreparedDiscSample = null;
    latestTrueDiscWorldPosition = null;
    latestTrueDiscSampledAtMs = 0;
    latestRequestToDiscLatencyMs = 0;
    pendingDiscRequests.clear();
    lastProcessedInputVersion = latestInputVersion;
    clearDiscPrimitive();
    pointQueryDebugRuntime.clearPointerState();
    updateReadout(null, null);
    queueRender();
  };

  const removePreRenderListener = engine.subscribePreRender(() => {
    if (!discInputNeedsRender && !discSmoothingNeedsRender) {
      return;
    }

    const allowTrueSample = discInputNeedsRender;
    discInputNeedsRender = false;
    discSmoothingNeedsRender = false;
    renderDiscAndReadout({ allowTrueSample });
  });

  const commitLatestInputClientPosition = ({
    x,
    y,
    timestampMs,
  }: {
    x: number;
    y: number;
    timestampMs: number;
  }) => {
    latestInputClientPosition = {
      x,
      y,
      timestampMs,
    };
    latestInputVersion += 1;
    pendingDiscRequests.set(latestInputVersion, {
      inputVersion: latestInputVersion,
      requestedAtMs: timestampMs,
      requestClientPosition: {
        x,
        y,
      },
      requestSampleClientPosition: null,
    });
    latestRequestedAtMs = timestampMs;
    if (pendingDiscRequests.size > 32) {
      const oldestInputVersion = pendingDiscRequests.keys().next().value;
      if (typeof oldestInputVersion === "number") {
        pendingDiscRequests.delete(oldestInputVersion);
      }
    }
    latestPreparedDiscSample = isPointQueryDiscPlaneOffsetPlacementMode(
      readDiscPlacementMode()
    )
      ? prepareFastDiscSample(latestInputVersion, { x, y })
      : null;
  };

  const handleCanvasPointerMove = (event: PointerEvent) => {
    const nowMs = performance.now();
    const nextClientPosition = {
      x: event.clientX,
      y: event.clientY,
    };
    updateObservedClientPosition({
      x: nextClientPosition.x,
      y: nextClientPosition.y,
    });
    if (
      rawPointerSupported &&
      isPointQueryDiscPlaneOffsetPlacementMode(readDiscPlacementMode()) &&
      nowMs - lastRawPointerEventTimeMs <
        pointQueryControllerDefaults.sampling.rawPointerFallbackWindowMs &&
      isSameClientPosition(nextClientPosition, latestInputClientPosition)
    ) {
      markMousePositionEvent();
      return;
    }
    commitLatestInputClientPosition({
      x: nextClientPosition.x,
      y: nextClientPosition.y,
      timestampMs: latestObservedClientPosition?.timestampMs ?? nowMs,
    });
    syncDebugLagState();
    markMousePositionEvent();
    queueRender();
  };
  const handleCanvasPointerRawUpdate = (event: PointerEvent) => {
    const coalescedEvents =
      "getCoalescedEvents" in event ? event.getCoalescedEvents() : [];
    const latestEvent =
      coalescedEvents.length > 0
        ? coalescedEvents[coalescedEvents.length - 1]
        : event;
    lastRawPointerEventTimeMs = performance.now();
    updateObservedClientPosition({
      x: latestEvent.clientX,
      y: latestEvent.clientY,
    });
    if (!isPointQueryDiscPlaneOffsetPlacementMode(readDiscPlacementMode())) {
      return;
    }
    commitLatestInputClientPosition({
      x: latestEvent.clientX,
      y: latestEvent.clientY,
      timestampMs: performance.now(),
    });
    const fastDiscSample = latestPreparedDiscSample;
    const nowMs = performance.now();
    if (fastDiscSample?.pickedPositionECEF) {
      // Immediate offline update:
      // intersect the current screen ray with the last true tangent plane to
      // keep the visible disc close to the cursor. The regular render cycle
      // still applies the next true mesh depth and updated smoothed normal.
      applyFastReprojectedDiscSample({
        renderDiscSample: fastDiscSample,
        renderedAtMs: nowMs,
      });
    }
    syncDebugLagState();
    markMousePositionEvent();
    if (shouldRefreshTrueDiscSample(nowMs)) {
      queueRender();
      return;
    }
    requestRenderOnly();
  };
  const handleCanvasPointerLeave = () => {
    clearPointer();
  };
  const handleWindowBlur = () => {
    clearPointer();
  };
  engine.canvas.addEventListener("pointermove", handleCanvasPointerMove, {
    passive: true,
  });
  engine.canvas.addEventListener(
    "pointerrawupdate",
    handleCanvasPointerRawUpdate as EventListener,
    {
      passive: true,
    }
  );
  engine.canvas.addEventListener("pointerleave", handleCanvasPointerLeave);
  window.addEventListener("blur", handleWindowBlur);
  const performanceIntervalId = window.setInterval(() => {
    pointQueryDebugRuntime.updatePerformanceStats();
  }, pointQueryControllerDefaults.performance.reportIntervalMs);

  pointQueryDebugRuntime.setEnabled(readDebugTelemetryEnabled());
  applyCursorVisibility();
  pointQueryDebugRuntime.resetStatusElements();
  queueRender();

  return {
    updateOptions: (nextOptions) => {
      const primitiveDefinitionChanged =
        currentOptions.discColor !== nextOptions.discColor ||
        currentOptions.discOpacity !== nextOptions.discOpacity ||
        currentOptions.discMaterialPreset !== nextOptions.discMaterialPreset ||
        currentOptions.innerHoleRadiusRatio !==
          nextOptions.innerHoleRadiusRatio;
      currentOptions = nextOptions;
      pointQueryDebugRuntime.setEnabled(readDebugTelemetryEnabled());
      applyCursorVisibility();
      if (primitiveDefinitionChanged) {
        clearDiscPrimitive();
      }
      queueRender();
    },
    getTelemetrySnapshot: () =>
      pointQueryDebugRuntime.getTelemetrySnapshot({
        maxRenderRequestRateHz:
          pointQueryControllerDefaults.performance.maxRenderRequestRateHz,
        latestInputVersion,
        lastProcessedInputVersion,
        latestRequestedAtMs,
        latestRenderedAtMs,
        latestRequestToDiscLatencyMs,
        latestClientPosition: latestObservedClientPosition
          ? {
              x: latestObservedClientPosition.x,
              y: latestObservedClientPosition.y,
            }
          : null,
        latestRenderedClientPosition,
        latestDiscClientPosition,
        latestSampleClientPosition,
        latestRequestedClientPosition,
        latestRequestedSampleClientPosition,
      }),
    destroy: () => {
      removePreRenderListener?.();
      unregisterPointerTracker();
      engine.canvas.removeEventListener("pointermove", handleCanvasPointerMove);
      engine.canvas.removeEventListener(
        "pointerrawupdate",
        handleCanvasPointerRawUpdate as EventListener
      );
      engine.canvas.removeEventListener(
        "pointerleave",
        handleCanvasPointerLeave
      );
      window.removeEventListener("blur", handleWindowBlur);
      window.clearInterval(performanceIntervalId);
      clearDiscPrimitive();
      discNormalLineCollection?.destroy();
      discNormalLineCollection = null;
      discNormalLineRuntime = null;
      pointQueryDebugRuntime.destroy();
      if (!engine.isDestroyed()) {
        engine.canvas.style.cursor = "";
      }
    },
  };
};
