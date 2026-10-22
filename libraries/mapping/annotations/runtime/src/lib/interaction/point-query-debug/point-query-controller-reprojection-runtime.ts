import { Vector3 } from "three";
import {
  createOrientedDiscMatrix,
  resolveStableDiscNormal,
} from "@carma-mapping/annotations/core";
import { pointPreviewRingVisualDefaults } from "../../config/point-preview-visual-defaults";
import { resolvePointQueryDiscRadius } from "../resolve-point-query-disc-radius";
import {
  resolveTangentDiscPlaneReprojectedWorldPosition,
  type TangentDiscSamplePlane,
} from "../tangent-disc-reprojection.shared";
import { POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS } from "./point-query-controller.types";
import {
  type ScreenVector,
  type PreparedDiscSample,
  type PointQueryControllerRuntime,
} from "./point-query-controller-runtime.types";

export const createPointQueryControllerReprojectionRuntime = (
  runtime: PointQueryControllerRuntime
) => {
  const resolveLatestTrueTangentPlane = (): TangentDiscSamplePlane | null => {
    if (!runtime.latestTrueDiscWorldPosition || !runtime.latestDiscNormal) {
      return null;
    }

    return {
      pointECEF: runtime.latestTrueDiscWorldPosition,
      normalECEF: runtime.latestDiscNormal,
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

    // The immediate local update only changes the visible position.
    // The displayed orientation keeps using the latest smoothed normal until the
    // next true sample updates depth and surface normal again.
    const stableDiscNormal = resolveStableDiscNormal(
      runtime.latestTrueDiscWorldPosition ?? renderDiscPositionECEF,
      runtime.latestDiscNormal ?? null,
      runtime.previousSurfaceNormal
    );
    const discRadius = Math.max(runtime.currentOptions.discRadiusMeters, 0.1);
    const sampledRadius = resolvePointQueryDiscRadius({
      engine: runtime.engine,
      pointECEF: renderDiscPositionECEF,
      discNormalECEF: stableDiscNormal,
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
        stableDiscNormal,
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
      source: "fast-reproject",
    });
    runtime.recordDiscOriginJump({
      inputVersion: renderDiscSample.inputVersion,
      source: "fast-reproject",
      nextDiscWorldPosition: renderDiscPositionECEF,
      nextClientPosition: pointerScreenPosition,
      nextDiscNormal: stableDiscNormal,
      requestedAtMs: requestMetrics?.requestedAtMs ?? renderedAtMs,
    });
    runtime.latestDiscWorldPosition = (
      runtime.latestDiscWorldPosition ?? new Vector3()
    ).copy(renderDiscPositionECEF);
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
        worldPosition: runtime.latestTrueDiscWorldPosition,
        canvasRect,
        fallbackScreenPosition: null,
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

  const prepareFastDiscSample = (
    inputVersion: number,
    clientPosition: ScreenVector | null
  ): PreparedDiscSample | null => {
    const screenPosition =
      runtime.resolvePointerScreenPositionFromClientPosition(clientPosition);
    if (!screenPosition) {
      runtime.recordTangentPlaneFailure({
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

    const tangentPlane = runtime.resolveLatestTrueTangentPlane();
    if (!tangentPlane) {
      runtime.recordTangentPlaneFailure({
        inputVersion,
        reason: runtime.latestTrueDiscWorldPosition
          ? POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_NORMAL
          : POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_POINT,
        clientPosition,
        screenPosition: {
          x: screenPosition.x,
          y: screenPosition.y,
        },
        hasSampledPoint: Boolean(runtime.latestTrueDiscWorldPosition),
        hasSampledSurfaceNormal: Boolean(runtime.latestDiscNormal),
      });
      return null;
    }

    const reprojectedWorldPosition =
      resolveTangentDiscPlaneReprojectedWorldPosition({
        engine: runtime.engine,
        screenPosition,
        tangentPlane,
      });
    if (!reprojectedWorldPosition) {
      runtime.recordTangentPlaneFailure({
        inputVersion,
        reason: POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.REPROJECTION_MISS,
        clientPosition,
        screenPosition: {
          x: screenPosition.x,
          y: screenPosition.y,
        },
        hasSampledPoint: true,
        hasSampledSurfaceNormal: Boolean(runtime.latestDiscNormal),
      });
      return null;
    }

    return {
      inputVersion,
      screenPosition: { x: screenPosition.x, y: screenPosition.y },
      pickedPositionECEF: reprojectedWorldPosition.clone(),
      surfaceNormalECEF: runtime.latestDiscNormal
        ? runtime.latestDiscNormal.clone()
        : null,
    };
  };

  const prepareDisplayedDiscSampleForSmoothing = (
    inputVersion: number
  ): PreparedDiscSample | null => {
    const screenPosition = runtime.resolvePointerScreenPosition();
    const displayedDiscWorldPosition =
      runtime.latestDiscWorldPosition ?? runtime.latestTrueDiscWorldPosition;
    if (!screenPosition || !displayedDiscWorldPosition) {
      return null;
    }

    return {
      inputVersion,
      screenPosition: { x: screenPosition.x, y: screenPosition.y },
      pickedPositionECEF: displayedDiscWorldPosition.clone(),
      surfaceNormalECEF: runtime.latestDiscNormal
        ? runtime.latestDiscNormal.clone()
        : null,
    };
  };

  return {
    resolveLatestTrueTangentPlane,
    applyFastReprojectedDiscSample,
    prepareFastDiscSample,
    prepareDisplayedDiscSampleForSmoothing,
  };
};
