import { Vector3 } from "three";
import { isPointQueryDiscPlaneOffsetPlacementMode } from "./point-query-disc-placement-mode";
import {
  type PreparedDiscSample,
  type PointQueryControllerRuntime,
} from "./point-query-controller-runtime.types";
import { pointQueryControllerDefaults } from "./point-query-controller-defaults";

export const createPointQueryControllerInputRuntime = (
  runtime: PointQueryControllerRuntime
) => {
  const renderDiscAndReadout = ({
    allowTrueSample,
  }: {
    allowTrueSample: boolean;
  }) => {
    if (!runtime.currentOptions.queryEnabled) {
      runtime.clearDiscPrimitive();
      runtime.updateReadout(null, null);
      runtime.syncDebugLagState();
      return;
    }

    const nowMs = performance.now();
    const placementMode = runtime.readDiscPlacementMode();
    const shouldUseFastReproject =
      isPointQueryDiscPlaneOffsetPlacementMode(placementMode);

    let trueDiscSample: PreparedDiscSample | null = null;
    let renderDiscSample: PreparedDiscSample | null = null;

    if (allowTrueSample && runtime.shouldRefreshTrueDiscSample(nowMs)) {
      trueDiscSample = runtime.sampleTrueDiscAtCurrentPointer({
        sampleSurfaceNormal: runtime.shouldRefreshTrueDiscNormal(nowMs),
      });
      if (trueDiscSample?.pickedPositionECEF) {
        runtime.latestTrueDiscWorldPosition = (
          runtime.latestTrueDiscWorldPosition ?? new Vector3()
        ).copy(trueDiscSample.pickedPositionECEF);
        runtime.latestTrueDiscSampledAtMs = nowMs;
        if (trueDiscSample.surfaceNormalECEF) {
          runtime.latestTrueDiscNormalSampledAtMs = nowMs;
        }
      }
    }

    if (!allowTrueSample) {
      renderDiscSample = runtime.prepareDisplayedDiscSampleForSmoothing(
        runtime.latestInputVersion
      );
    } else if (trueDiscSample) {
      renderDiscSample = trueDiscSample;
      runtime.latestPreparedDiscSample = null;
    } else if (shouldUseFastReproject) {
      renderDiscSample =
        runtime.latestPreparedDiscSample &&
        runtime.latestPreparedDiscSample.inputVersion ===
          runtime.latestInputVersion
          ? runtime.latestPreparedDiscSample
          : null;

      if (!renderDiscSample) {
        renderDiscSample = runtime.prepareFastDiscSample(
          runtime.latestInputVersion,
          runtime.latestInputClientPosition
            ? {
                x: runtime.latestInputClientPosition.x,
                y: runtime.latestInputClientPosition.y,
              }
            : null
        );
      }
    } else {
      renderDiscSample = runtime.prepareDisplayedDiscSampleForSmoothing(
        runtime.latestInputVersion
      );
    }

    if (!renderDiscSample) {
      runtime.clearDiscPrimitive();
      runtime.updateReadout(null, null);
      runtime.syncDebugLagState();
      return;
    }
    const pointerScreenPosition = renderDiscSample.screenPosition;
    const pickedPositionECEF = renderDiscSample.pickedPositionECEF;
    const truePickedPositionECEF =
      trueDiscSample?.pickedPositionECEF ?? runtime.latestTrueDiscWorldPosition;
    runtime.applyRenderedDiscSample({
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
    if (runtime.engine.isDestroyed()) {
      return;
    }

    runtime.markRenderRequestEvent();
    runtime.engine.requestRender();
  };

  const requestRenderNow = () => {
    if (runtime.engine.isDestroyed()) {
      return;
    }

    runtime.discInputNeedsRender = true;
    runtime.discSmoothingNeedsRender = false;
    runtime.requestRenderOnly();
  };

  const queueRender = () => {
    runtime.requestRenderNow();
  };

  const clearPointer = () => {
    runtime.latestObservedClientPosition = null;
    runtime.latestInputClientPosition = null;
    runtime.latestRenderedClientPosition = null;
    runtime.latestDiscClientPosition = null;
    runtime.latestSampleClientPosition = null;
    runtime.latestRequestedClientPosition = null;
    runtime.latestRequestedSampleClientPosition = null;
    runtime.latestPreparedDiscSample = null;
    runtime.latestTrueDiscWorldPosition = null;
    runtime.latestTrueDiscSampledAtMs = 0;
    runtime.latestRequestToDiscLatencyMs = 0;
    runtime.pendingDiscRequests.clear();
    runtime.lastProcessedInputVersion = runtime.latestInputVersion;
    runtime.clearDiscPrimitive();
    runtime.pointQueryDebugRuntime.clearPointerState();
    runtime.updateReadout(null, null);
    runtime.queueRender();
  };

  const commitLatestInputClientPosition = ({
    x,
    y,
    timestampMs,
  }: {
    x: number;
    y: number;
    timestampMs: number;
  }) => {
    runtime.latestInputClientPosition = {
      x,
      y,
      timestampMs,
    };
    runtime.latestInputVersion += 1;
    runtime.pendingDiscRequests.set(runtime.latestInputVersion, {
      inputVersion: runtime.latestInputVersion,
      requestedAtMs: timestampMs,
      requestClientPosition: {
        x,
        y,
      },
      requestSampleClientPosition: null,
    });
    runtime.latestRequestedAtMs = timestampMs;
    if (runtime.pendingDiscRequests.size > 32) {
      const oldestInputVersion = runtime.pendingDiscRequests
        .keys()
        .next().value;
      if (typeof oldestInputVersion === "number") {
        runtime.pendingDiscRequests.delete(oldestInputVersion);
      }
    }
    runtime.latestPreparedDiscSample = isPointQueryDiscPlaneOffsetPlacementMode(
      runtime.readDiscPlacementMode()
    )
      ? runtime.prepareFastDiscSample(runtime.latestInputVersion, { x, y })
      : null;
  };

  const handleCanvasPointerMove = (event: PointerEvent) => {
    const nowMs = performance.now();
    const nextClientPosition = {
      x: event.clientX,
      y: event.clientY,
    };
    runtime.updateObservedClientPosition({
      x: nextClientPosition.x,
      y: nextClientPosition.y,
    });
    if (
      runtime.rawPointerSupported &&
      isPointQueryDiscPlaneOffsetPlacementMode(
        runtime.readDiscPlacementMode()
      ) &&
      nowMs - runtime.lastRawPointerEventTimeMs <
        pointQueryControllerDefaults.sampling.rawPointerFallbackWindowMs &&
      runtime.isSameClientPosition(
        nextClientPosition,
        runtime.latestInputClientPosition
      )
    ) {
      runtime.markMousePositionEvent();
      return;
    }
    runtime.commitLatestInputClientPosition({
      x: nextClientPosition.x,
      y: nextClientPosition.y,
      timestampMs: runtime.latestObservedClientPosition?.timestampMs ?? nowMs,
    });
    runtime.syncDebugLagState();
    runtime.markMousePositionEvent();
    runtime.queueRender();
  };

  const handleCanvasPointerRawUpdate = (event: PointerEvent) => {
    const coalescedEvents =
      "getCoalescedEvents" in event ? event.getCoalescedEvents() : [];
    const latestEvent =
      coalescedEvents.length > 0
        ? coalescedEvents[coalescedEvents.length - 1]
        : event;
    runtime.lastRawPointerEventTimeMs = performance.now();
    runtime.updateObservedClientPosition({
      x: latestEvent.clientX,
      y: latestEvent.clientY,
    });
    if (
      !isPointQueryDiscPlaneOffsetPlacementMode(runtime.readDiscPlacementMode())
    ) {
      return;
    }
    runtime.commitLatestInputClientPosition({
      x: latestEvent.clientX,
      y: latestEvent.clientY,
      timestampMs: performance.now(),
    });
    const fastDiscSample = runtime.latestPreparedDiscSample;
    const nowMs = performance.now();
    if (fastDiscSample?.pickedPositionECEF) {
      // Immediate offline update:
      // intersect the current screen ray with the last true tangent plane to
      // keep the visible disc close to the cursor. The regular render cycle
      // still applies the next true mesh depth and updated smoothed normal.
      runtime.applyFastReprojectedDiscSample({
        renderDiscSample: fastDiscSample,
        renderedAtMs: nowMs,
      });
    }
    runtime.syncDebugLagState();
    runtime.markMousePositionEvent();
    if (runtime.shouldRefreshTrueDiscSample(nowMs)) {
      runtime.queueRender();
      return;
    }
    runtime.requestRenderOnly();
  };

  const handleCanvasPointerLeave = () => {
    runtime.clearPointer();
  };

  const handleWindowBlur = () => {
    runtime.clearPointer();
  };

  return {
    renderDiscAndReadout,
    requestRenderOnly,
    requestRenderNow,
    queueRender,
    clearPointer,
    commitLatestInputClientPosition,
    handleCanvasPointerMove,
    handleCanvasPointerRawUpdate,
    handleCanvasPointerLeave,
    handleWindowBlur,
  };
};
