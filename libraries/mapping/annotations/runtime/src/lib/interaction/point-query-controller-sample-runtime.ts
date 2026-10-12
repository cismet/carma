import { Vector3 } from "three";
import {
  createOrientedDiscMatrix,
  resolveStableDiscNormal,
} from "@carma-mapping/annotations/core";
import { pointPreviewRingVisualDefaults } from "../config/point-preview-visual-defaults";
import { isPointQueryDiscPlaneOffsetPlacementMode } from "./point-query-disc-placement-mode";
import { resolvePointQueryDiscRadius } from "./resolve-point-query-disc-radius";
import { POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS } from "./point-query-controller.types";
import {
  type PreparedDiscSample,
  type PointQueryControllerRuntime,
} from "./point-query-controller-runtime.types";
import { pointQueryControllerDefaults } from "./point-query-controller-defaults";

export const createPointQueryControllerSampleRuntime = (
  runtime: PointQueryControllerRuntime
) => {
  const sampleTrueDiscAtCurrentPointer = ({
    sampleSurfaceNormal,
  }: {
    sampleSurfaceNormal: boolean;
  }): PreparedDiscSample | null => {
    const pointerScreenPosition = runtime.resolvePointerScreenPosition();
    if (!pointerScreenPosition) {
      runtime.recordTangentPlaneFailure({
        inputVersion: runtime.latestInputVersion,
        reason:
          POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_SCREEN_POSITION,
        clientPosition: runtime.latestInputClientPosition
          ? {
              x: runtime.latestInputClientPosition.x,
              y: runtime.latestInputClientPosition.y,
            }
          : null,
        screenPosition: null,
        hasSampledPoint: false,
        hasSampledSurfaceNormal: false,
      });
      return null;
    }

    const resolvedPick = runtime.withDiscTemporarilyHidden(() =>
      runtime.engine.resolveSurfacePick(pointerScreenPosition, {
        resolveGlobePosition: false,
      })
    );
    runtime.markSampleEvent();
    const pickedPositionECEF = resolvedPick.surfacePositionECEF
      ? resolvedPick.surfacePositionECEF.clone()
      : null;
    const sampledSurfaceNormalECEF =
      sampleSurfaceNormal && pickedPositionECEF
        ? runtime.withDiscTemporarilyHidden(() =>
            runtime.engine.sampleSurfaceNormalAt(
              pointerScreenPosition,
              pickedPositionECEF
            )
          )
        : null;
    const surfaceNormalECEF =
      sampledSurfaceNormalECEF ??
      (runtime.previousSurfaceNormal
        ? runtime.previousSurfaceNormal.clone()
        : null);

    if (!pickedPositionECEF) {
      runtime.recordTangentPlaneFailure({
        inputVersion: runtime.latestInputVersion,
        reason: POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS,
        clientPosition: runtime.latestInputClientPosition
          ? {
              x: runtime.latestInputClientPosition.x,
              y: runtime.latestInputClientPosition.y,
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
      runtime.recordTangentPlaneFailure({
        inputVersion: runtime.latestInputVersion,
        reason: POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_NORMAL_MISS,
        clientPosition: runtime.latestInputClientPosition
          ? {
              x: runtime.latestInputClientPosition.x,
              y: runtime.latestInputClientPosition.y,
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
      inputVersion: runtime.latestInputVersion,
      screenPosition: {
        x: pointerScreenPosition.x,
        y: pointerScreenPosition.y,
      },
      pickedPositionECEF,
      surfaceNormalECEF: surfaceNormalECEF ? surfaceNormalECEF.clone() : null,
    };
  };

  const shouldRefreshTrueDiscSample = (nowMs: number) =>
    !isPointQueryDiscPlaneOffsetPlacementMode(
      runtime.readDiscPlacementMode()
    ) ||
    !runtime.latestTrueDiscWorldPosition ||
    !runtime.latestDiscNormal ||
    runtime.pointQueryDebugRuntime.readLatestSampleOffsetPx() >=
      pointQueryControllerDefaults.sampling.maxFastSampleOffsetPx ||
    nowMs - runtime.latestTrueDiscSampledAtMs >=
      pointQueryControllerDefaults.sampling.trueSampleRefreshIntervalMs;

  const shouldRefreshTrueDiscNormal = (nowMs: number) =>
    !runtime.latestDiscNormal ||
    runtime.pointQueryDebugRuntime.readLatestSampleOffsetPx() >=
      pointQueryControllerDefaults.sampling.maxFastSampleOffsetPx ||
    nowMs - runtime.latestTrueDiscNormalSampledAtMs >=
      pointQueryControllerDefaults.sampling.trueNormalRefreshIntervalMs;

  const consumeRenderedRequestMetrics = (
    inputVersion: number,
    renderedAtMs: number
  ) => {
    const requestMetrics =
      runtime.pendingDiscRequests.get(inputVersion) ?? null;
    if (requestMetrics) {
      runtime.latestRenderedAtMs = renderedAtMs;
      runtime.latestRequestedAtMs = requestMetrics.requestedAtMs;
      runtime.latestRequestToDiscLatencyMs = Math.max(
        runtime.latestRenderedAtMs - requestMetrics.requestedAtMs,
        0
      );
      runtime.latestRequestedClientPosition =
        requestMetrics.requestClientPosition;
      runtime.latestRequestedSampleClientPosition =
        requestMetrics.requestSampleClientPosition;
      runtime.latestRenderedClientPosition =
        requestMetrics.requestSampleClientPosition ??
        requestMetrics.requestClientPosition;
      runtime.pointQueryDebugRuntime.updateRequestToDiscLatencyMs(
        runtime.latestRequestToDiscLatencyMs
      );
    }

    for (const pendingInputVersion of runtime.pendingDiscRequests.keys()) {
      if (pendingInputVersion <= inputVersion) {
        runtime.pendingDiscRequests.delete(pendingInputVersion);
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

    runtime.updateReadout(pointerScreenPosition, renderDiscPositionECEF);
    const skippedInputCount = Math.max(
      runtime.latestInputVersion - runtime.lastProcessedInputVersion - 1,
      0
    );
    runtime.markSkippedInputEvents(skippedInputCount);
    runtime.lastProcessedInputVersion = runtime.latestInputVersion;
    const requestMetrics = runtime.consumeRenderedRequestMetrics(
      renderDiscSample.inputVersion,
      renderedAtMs
    );

    if (
      !runtime.readTangentDiscVisualizerEnabled() ||
      !renderDiscPositionECEF
    ) {
      runtime.clearDiscPrimitive();
      runtime.syncDebugLagState();
      runtime.markDiscUpdateEvent();
      runtime.recordTelemetryEntry();
      return;
    }

    runtime.previousSurfaceNormal = trueSampledSurfaceNormal
      ? (runtime.previousSurfaceNormal ?? new Vector3()).copy(
          trueSampledSurfaceNormal
        )
      : runtime.previousSurfaceNormal;

    if (
      truePickedPositionECEF &&
      runtime.shouldQueueDiscNormalSample(renderDiscSample.inputVersion)
    ) {
      const trueDiscNormal = resolveStableDiscNormal(
        truePickedPositionECEF,
        trueSampledSurfaceNormal ?? null,
        runtime.previousSurfaceNormal
      );
      runtime.queueDiscNormalSample(trueDiscNormal);
    }

    const fallbackNormal =
      renderDiscSample.surfaceNormalECEF ??
      runtime.latestDiscNormal ??
      runtime.previousSurfaceNormal;
    const discNormal = resolveStableDiscNormal(
      renderDiscPositionECEF,
      renderDiscSample.surfaceNormalECEF ?? null,
      fallbackNormal ?? null
    );
    const averagedDiscNormal = runtime.getAveragedDiscNormal(discNormal);
    runtime.requestNormalSmoothingRender();
    const discRadius = Math.max(runtime.currentOptions.discRadiusMeters, 0.1);
    const sampledRadius = resolvePointQueryDiscRadius({
      engine: runtime.engine,
      pointECEF: renderDiscPositionECEF,
      discNormalECEF: averagedDiscNormal,
      radiusMeters: discRadius,
      scalingMode: runtime.currentOptions.discScalingMode,
      targetScreenRadiusCssPx:
        runtime.currentOptions.targetScreenRadiusCssPx ??
        pointPreviewRingVisualDefaults.targetScreenRadiusCssPx,
    });
    const activeDiscPrimitive = runtime.ensureDiscPrimitive();
    activeDiscPrimitive.setModelMatrix(
      createOrientedDiscMatrix(
        renderDiscPositionECEF,
        averagedDiscNormal,
        sampledRadius,
        runtime.discModelMatrix
      )
    );
    runtime.applyDiscNormalLine({
      modelMatrix: runtime.discModelMatrix,
      lineLengthMeters: sampledRadius * 2,
    });
    runtime.recordDiscScaleChange({
      inputVersion: renderDiscSample.inputVersion,
      requestedAtMs: requestMetrics?.requestedAtMs ?? renderedAtMs,
      nextScaleFactor: sampledRadius,
      source: "true-sample",
    });
    runtime.recordDiscOriginJump({
      inputVersion: renderDiscSample.inputVersion,
      source: "true-sample",
      nextDiscWorldPosition: renderDiscPositionECEF,
      nextClientPosition: pointerScreenPosition,
      nextDiscNormal: averagedDiscNormal,
      requestedAtMs: requestMetrics?.requestedAtMs ?? renderedAtMs,
    });
    runtime.previousSurfaceNormal = (
      runtime.previousSurfaceNormal ?? new Vector3()
    ).copy(averagedDiscNormal);
    runtime.latestDiscWorldPosition = (
      runtime.latestDiscWorldPosition ?? new Vector3()
    ).copy(renderDiscPositionECEF);
    runtime.latestDiscNormal = (runtime.latestDiscNormal ?? new Vector3()).copy(
      averagedDiscNormal
    );
    const canvasRect = runtime.engine.canvas.getBoundingClientRect();
    runtime.latestDiscClientPosition =
      runtime.resolveClientPositionFromWorldPosition({
        worldPosition: renderDiscPositionECEF,
        canvasRect,
        fallbackScreenPosition: pointerScreenPosition,
        scratchScreenPosition: runtime.projectedDiscScreenPositionScratch,
      });
    runtime.latestSampleClientPosition =
      runtime.resolveClientPositionFromWorldPosition({
        worldPosition: truePickedPositionECEF,
        canvasRect,
        fallbackScreenPosition: truePickedPositionECEF
          ? pointerScreenPosition
          : null,
        scratchScreenPosition: runtime.projectedSampleScreenPositionScratch,
      });
    if (requestMetrics && runtime.latestSampleClientPosition) {
      runtime.latestRequestedSampleClientPosition = {
        ...runtime.latestSampleClientPosition,
      };
    }
    runtime.syncDebugLagState();
    runtime.markDiscUpdateEvent();
    runtime.recordTelemetryEntry();
  };

  return {
    sampleTrueDiscAtCurrentPointer,
    shouldRefreshTrueDiscSample,
    shouldRefreshTrueDiscNormal,
    consumeRenderedRequestMetrics,
    applyRenderedDiscSample,
  };
};
