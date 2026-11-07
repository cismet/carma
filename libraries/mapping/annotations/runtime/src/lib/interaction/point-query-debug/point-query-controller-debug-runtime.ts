import { Vector3 } from "three";
import { formatPointQueryReadout as formatReadout } from "./point-query-debug-status";
import { type PointQueryTangentPlaneFailureReason } from "./point-query-controller.types";
import {
  type ScreenVector,
  type PointQueryControllerRuntime,
} from "./point-query-controller-runtime.types";

export const createPointQueryControllerDebugRuntime = (
  runtime: PointQueryControllerRuntime
) => {
  const updateReadout = (
    screenPosition: { x: number; y: number } | null,
    pickedPositionECEF: Vector3 | null
  ) => {
    if (!runtime.readoutElement) {
      return;
    }

    runtime.readoutElement.textContent = formatReadout(
      screenPosition,
      pickedPositionECEF
    );
  };

  const markMousePositionEvent = () => {
    runtime.pointQueryDebugRuntime.markMousePositionEvent();
  };

  const markRenderRequestEvent = () => {
    runtime.pointQueryDebugRuntime.markRenderRequestEvent();
  };

  const requestNormalSmoothingRender = () => {
    if (
      runtime.engine.isDestroyed() ||
      runtime.discNormalSamples.length <= 1 ||
      runtime.discInputNeedsRender ||
      runtime.discSmoothingNeedsRender
    ) {
      return;
    }

    runtime.discSmoothingNeedsRender = true;
    runtime.markRenderRequestEvent();
    runtime.engine.requestRender();
  };

  const markSampleEvent = () => {
    runtime.pointQueryDebugRuntime.markSampleEvent();
  };

  const markDiscUpdateEvent = () => {
    runtime.pointQueryDebugRuntime.markDiscUpdateEvent();
  };

  const markSkippedInputEvents = (count: number) => {
    runtime.pointQueryDebugRuntime.markSkippedInputEvents(count);
  };

  const recordTelemetryEntry = () => {
    runtime.pointQueryDebugRuntime.recordTelemetryEntry({
      latestInputVersion: runtime.latestInputVersion,
      lastProcessedInputVersion: runtime.lastProcessedInputVersion,
      latestRequestedAtMs: runtime.latestRequestedAtMs,
      latestRenderedAtMs: runtime.latestRenderedAtMs,
      latestClientPosition: runtime.latestObservedClientPosition,
      latestRenderedClientPosition: runtime.latestRenderedClientPosition,
      latestDiscClientPosition: runtime.latestDiscClientPosition,
      latestSampleClientPosition: runtime.latestSampleClientPosition,
      latestRequestedClientPosition: runtime.latestRequestedClientPosition,
      latestRequestedSampleClientPosition:
        runtime.latestRequestedSampleClientPosition,
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
    const pendingRequest =
      runtime.pendingDiscRequests.get(inputVersion) ?? null;
    runtime.pointQueryDebugRuntime.recordTangentPlaneFailure({
      inputVersion,
      reason,
      requestedAtMs:
        pendingRequest?.requestedAtMs ??
        runtime.latestRequestedAtMs ??
        performance.now(),
      placementMode: runtime.readDiscPlacementMode(),
      hasLatestTrueDiscWorldPosition: Boolean(
        runtime.latestTrueDiscWorldPosition
      ),
      hasLatestDiscNormal: Boolean(runtime.latestDiscNormal),
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
    runtime.pointQueryDebugRuntime.recordDiscOriginJump({
      inputVersion,
      requestedAtMs,
      placementMode: runtime.readDiscPlacementMode(),
      previousDiscWorldPosition: runtime.latestDiscWorldPosition,
      source,
      nextDiscWorldPosition,
      nextClientPosition,
      nextDiscNormal,
      previousClientPosition: runtime.latestDiscClientPosition,
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
    runtime.pointQueryDebugRuntime.recordDiscScaleChange({
      inputVersion,
      requestedAtMs,
      placementMode: runtime.readDiscPlacementMode(),
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
      const projectedScreenPosition = runtime.engine.worldToScreen(
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
    runtime.latestObservedClientPosition = {
      x,
      y,
      timestampMs: performance.now(),
    };
    runtime.syncDebugLagState();
  };

  return {
    updateReadout,
    markMousePositionEvent,
    markRenderRequestEvent,
    requestNormalSmoothingRender,
    markSampleEvent,
    markDiscUpdateEvent,
    markSkippedInputEvents,
    recordTelemetryEntry,
    recordTangentPlaneFailure,
    recordDiscOriginJump,
    recordDiscScaleChange,
    resolveClientPositionFromWorldPosition,
    updateObservedClientPosition,
  };
};
