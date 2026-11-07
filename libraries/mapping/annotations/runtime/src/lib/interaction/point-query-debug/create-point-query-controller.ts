import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import {
  type PointQueryController,
  type PointQueryControllerOptions,
  type PointQueryTangentPlaneFailure,
} from "./point-query-controller.types";
import { type PointQueryControllerRuntime } from "./point-query-controller-runtime.types";
import { createPointQueryControllerState } from "./point-query-controller-state";
import { createPointQueryControllerVisualRuntime } from "./point-query-controller-visual-runtime";
import { createPointQueryControllerDebugRuntime } from "./point-query-controller-debug-runtime";
import { createPointQueryControllerSampleRuntime } from "./point-query-controller-sample-runtime";
import { createPointQueryControllerReprojectionRuntime } from "./point-query-controller-reprojection-runtime";
import { createPointQueryControllerInputRuntime } from "./point-query-controller-input-runtime";
import { pointQueryControllerDefaults } from "./point-query-controller-defaults";

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
  const runtime = createPointQueryControllerState({
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
  }) as PointQueryControllerRuntime;
  Object.assign(runtime, createPointQueryControllerVisualRuntime(runtime));
  Object.assign(runtime, createPointQueryControllerDebugRuntime(runtime));
  Object.assign(runtime, createPointQueryControllerSampleRuntime(runtime));
  Object.assign(
    runtime,
    createPointQueryControllerReprojectionRuntime(runtime)
  );
  Object.assign(runtime, createPointQueryControllerInputRuntime(runtime));

  const removePreRenderListener = runtime.engine.subscribePreRender(() => {
    if (!runtime.discInputNeedsRender && !runtime.discSmoothingNeedsRender) {
      return;
    }

    const allowTrueSample = runtime.discInputNeedsRender;
    runtime.discInputNeedsRender = false;
    runtime.discSmoothingNeedsRender = false;
    runtime.renderDiscAndReadout({ allowTrueSample });
  });

  runtime.engine.canvas.addEventListener(
    "pointermove",
    runtime.handleCanvasPointerMove,
    {
      passive: true,
    }
  );

  runtime.engine.canvas.addEventListener(
    "pointerrawupdate",
    runtime.handleCanvasPointerRawUpdate as EventListener,
    {
      passive: true,
    }
  );

  runtime.engine.canvas.addEventListener(
    "pointerleave",
    runtime.handleCanvasPointerLeave
  );

  window.addEventListener("blur", runtime.handleWindowBlur);

  runtime.pointQueryDebugRuntime.setEnabled(
    runtime.readDebugTelemetryEnabled()
  );

  runtime.applyCursorVisibility();

  runtime.pointQueryDebugRuntime.resetStatusElements();

  runtime.queueRender();

  return {
    updateOptions: (nextOptions) => {
      const primitiveDefinitionChanged =
        runtime.currentOptions.discColor !== nextOptions.discColor ||
        runtime.currentOptions.discOpacity !== nextOptions.discOpacity ||
        runtime.currentOptions.discMaterialPreset !==
          nextOptions.discMaterialPreset ||
        runtime.currentOptions.innerHoleRadiusRatio !==
          nextOptions.innerHoleRadiusRatio;
      runtime.currentOptions = nextOptions;
      runtime.pointQueryDebugRuntime.setEnabled(
        runtime.readDebugTelemetryEnabled()
      );
      runtime.applyCursorVisibility();
      if (primitiveDefinitionChanged) {
        runtime.clearDiscPrimitive();
      }
      runtime.queueRender();
    },
    getTelemetrySnapshot: () =>
      runtime.pointQueryDebugRuntime.getTelemetrySnapshot({
        maxRenderRequestRateHz:
          pointQueryControllerDefaults.performance.maxRenderRequestRateHz,
        latestInputVersion: runtime.latestInputVersion,
        lastProcessedInputVersion: runtime.lastProcessedInputVersion,
        latestRequestedAtMs: runtime.latestRequestedAtMs,
        latestRenderedAtMs: runtime.latestRenderedAtMs,
        latestRequestToDiscLatencyMs: runtime.latestRequestToDiscLatencyMs,
        latestClientPosition: runtime.latestObservedClientPosition
          ? {
              x: runtime.latestObservedClientPosition.x,
              y: runtime.latestObservedClientPosition.y,
            }
          : null,
        latestRenderedClientPosition: runtime.latestRenderedClientPosition,
        latestDiscClientPosition: runtime.latestDiscClientPosition,
        latestSampleClientPosition: runtime.latestSampleClientPosition,
        latestRequestedClientPosition: runtime.latestRequestedClientPosition,
        latestRequestedSampleClientPosition:
          runtime.latestRequestedSampleClientPosition,
      }),
    destroy: () => {
      removePreRenderListener?.();
      runtime.unregisterPointerTracker();
      runtime.engine.canvas.removeEventListener(
        "pointermove",
        runtime.handleCanvasPointerMove
      );
      runtime.engine.canvas.removeEventListener(
        "pointerrawupdate",
        runtime.handleCanvasPointerRawUpdate as EventListener
      );
      runtime.engine.canvas.removeEventListener(
        "pointerleave",
        runtime.handleCanvasPointerLeave
      );
      window.removeEventListener("blur", runtime.handleWindowBlur);
      runtime.clearDiscPrimitive();
      runtime.discNormalLineCollection?.destroy();
      runtime.discNormalLineCollection = null;
      runtime.discNormalLineRuntime = null;
      runtime.pointQueryDebugRuntime.destroy();
      if (!runtime.engine.isDestroyed()) {
        runtime.engine.canvas.style.cursor = "";
      }
    },
  };
};
