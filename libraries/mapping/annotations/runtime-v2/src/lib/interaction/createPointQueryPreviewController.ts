import { Cartesian3, Color, Primitive, type Scene } from "@carma-cesium";
import {
  createOrientedDiscModelMatrix,
  createRing,
  RING_MATERIAL_PRESETS,
  resolveDiscNormal,
  safeRemovePrimitive,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  getCesiumScenePointerScreenPosition,
  registerCesiumScenePointerTracker,
  resolvePreferredPointQueryPick,
  samplePreferredPointQuerySurfaceNormal,
  subscribeCesiumScenePointerClientPosition,
} from "@carma-mapping/engines/cesium/react/interactions";
import { pointPreviewRingVisualDefaults } from "../config/pointPreviewVisualDefaults";
import { resolveCrosshairCanvasCursor } from "./resolveCrosshairCanvasCursor";
import { resolvePointPreviewDiscRadius } from "./resolvePointPreviewDiscRadius";

export type PointQueryPreviewControllerOptions = {
  queryEnabled: boolean;
  showCursor: boolean;
  showDisc: boolean;
  hideNativeCursor: boolean;
  discRadiusMeters: number;
  discScalingMode: "screen" | "world";
  innerHoleRadiusRatio?: number;
  targetScreenRadiusCssPx?: number;
  discOpacity: number;
  discMaterialPreset: RingMaterialPreset;
  discColor: string;
};

export type PointQueryPreviewController = {
  updateOptions: (options: PointQueryPreviewControllerOptions) => void;
  destroy: () => void;
};

const formatReadout = (
  screenPosition: { x: number; y: number } | null,
  pickedPositionECEF: Cartesian3 | null
) => {
  if (!screenPosition) {
    return "pointer idle";
  }

  const x = Math.round(screenPosition.x);
  const y = Math.round(screenPosition.y);

  if (!pickedPositionECEF) {
    return `x ${x} y ${y} no hit`;
  }

  return `x ${x} y ${y} hit`;
};

export const createPointQueryPreviewController = ({
  scene,
  readoutElement,
  mousePositionRateElement,
  sampleRateElement,
  discUpdateRateElement,
  options,
}: {
  scene: Scene;
  readoutElement: HTMLElement | null;
  mousePositionRateElement?: HTMLElement | null;
  sampleRateElement?: HTMLElement | null;
  discUpdateRateElement?: HTMLElement | null;
  options: PointQueryPreviewControllerOptions;
}): PointQueryPreviewController => {
  const unregisterPointerTracker = registerCesiumScenePointerTracker(scene);

  let currentOptions = options;
  let discPrimitive: Primitive | null = null;
  let discNeedsRender = false;
  let previousSurfaceNormal: Cartesian3 | null = null;
  let mousePositionEventCount = 0;
  let sampleEventCount = 0;
  let discUpdateEventCount = 0;
  let lastMousePositionEventTimeMs = 0;
  let lastSampleEventTimeMs = 0;
  let lastDiscUpdateEventTimeMs = 0;
  let lastPerformanceReportTimeMs = performance.now();
  let latestMousePositionRateHz = 0;
  let latestSampleRateHz = 0;
  let latestDiscUpdateRateHz = 0;
  const PERFORMANCE_IDLE_RESET_MS = 300;
  const PERFORMANCE_REPORT_INTERVAL_MS = 250;
  const readInnerHoleRadiusRatio = () =>
    Math.min(
      Math.max(
        currentOptions.innerHoleRadiusRatio ??
          pointPreviewRingVisualDefaults.innerHoleRadiusRatio,
        0
      ),
      0.999
    );

  const ensureDiscPrimitive = () => {
    if (discPrimitive) {
      return discPrimitive;
    }

    const color =
      Color.fromCssColorString(currentOptions.discColor) ?? Color.WHITE;
    const nextDiscPrimitive = createRing("story-cursor-overlay-disc", {
      radius: 1,
      innerRadius: readInnerHoleRadiusRatio(),
      color,
      opacity: currentOptions.discOpacity,
      materialPreset:
        currentOptions.discMaterialPreset ?? RING_MATERIAL_PRESETS.COLOR,
      segments: 20,
    });
    scene.primitives.add(nextDiscPrimitive);
    discPrimitive = nextDiscPrimitive;
    return nextDiscPrimitive;
  };

  const clearDiscPrimitive = () => {
    if (discPrimitive) {
      safeRemovePrimitive(scene, discPrimitive);
      discPrimitive = null;
    }
    previousSurfaceNormal = null;
  };

  const updateReadout = (
    screenPosition: { x: number; y: number } | null,
    pickedPositionECEF: Cartesian3 | null
  ) => {
    if (!readoutElement) {
      return;
    }

    readoutElement.textContent = formatReadout(
      screenPosition,
      pickedPositionECEF
    );
  };

  const updatePerformanceStats = (force = false) => {
    const nowMs = performance.now();
    const elapsedMs = nowMs - lastPerformanceReportTimeMs;
    const mouseIdle =
      lastMousePositionEventTimeMs <= 0 ||
      nowMs - lastMousePositionEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;
    const sampleIdle =
      lastSampleEventTimeMs <= 0 ||
      nowMs - lastSampleEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;
    const discIdle =
      lastDiscUpdateEventTimeMs <= 0 ||
      nowMs - lastDiscUpdateEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;

    if (
      !force &&
      elapsedMs < PERFORMANCE_REPORT_INTERVAL_MS &&
      !mouseIdle &&
      !sampleIdle &&
      !discIdle
    ) {
      return;
    }

    if (elapsedMs > 0) {
      if (mousePositionEventCount > 0) {
        latestMousePositionRateHz = (mousePositionEventCount * 1000) / elapsedMs;
      } else if (mouseIdle) {
        latestMousePositionRateHz = 0;
      }

      if (sampleEventCount > 0) {
        latestSampleRateHz = (sampleEventCount * 1000) / elapsedMs;
      } else if (sampleIdle) {
        latestSampleRateHz = 0;
      }

      if (discUpdateEventCount > 0) {
        latestDiscUpdateRateHz = (discUpdateEventCount * 1000) / elapsedMs;
      } else if (discIdle) {
        latestDiscUpdateRateHz = 0;
      }
    }

    if (mousePositionRateElement) {
      mousePositionRateElement.textContent = `mouse ${latestMousePositionRateHz.toFixed(1)} Hz`;
    }
    if (sampleRateElement) {
      sampleRateElement.textContent = `sample ${latestSampleRateHz.toFixed(1)} Hz`;
    }
    if (discUpdateRateElement) {
      discUpdateRateElement.textContent = `disc ${latestDiscUpdateRateHz.toFixed(1)} Hz`;
    }

    mousePositionEventCount = 0;
    sampleEventCount = 0;
    discUpdateEventCount = 0;
    lastPerformanceReportTimeMs = nowMs;
  };

  const markMousePositionEvent = () => {
    mousePositionEventCount += 1;
    lastMousePositionEventTimeMs = performance.now();
    updatePerformanceStats();
  };

  const markSampleEvent = () => {
    sampleEventCount += 1;
    lastSampleEventTimeMs = performance.now();
    updatePerformanceStats();
  };

  const markDiscUpdateEvent = () => {
    discUpdateEventCount += 1;
    lastDiscUpdateEventTimeMs = performance.now();
    updatePerformanceStats();
  };

  const applyCursorVisibility = () => {
    scene.canvas.style.cursor = resolveCrosshairCanvasCursor({
      queryEnabled: currentOptions.queryEnabled,
      showCursor: currentOptions.showCursor,
      hideNativeCursor: currentOptions.hideNativeCursor,
    });
  };

  const renderDiscAndReadout = () => {
    discNeedsRender = false;

    if (!currentOptions.queryEnabled) {
      clearDiscPrimitive();
      updateReadout(null, null);
      return;
    }

    const pointerScreenPosition = getCesiumScenePointerScreenPosition(scene);
    const screenPosition = pointerScreenPosition
      ? { x: pointerScreenPosition.x, y: pointerScreenPosition.y }
      : null;

    if (!pointerScreenPosition) {
      clearDiscPrimitive();
      updateReadout(null, null);
      return;
    }

    const resolvedPick = resolvePreferredPointQueryPick(
      scene,
      pointerScreenPosition,
      {
        resolveGlobePosition: false,
      }
    );
    markSampleEvent();
    const pickedPositionECEF = resolvedPick.pickedPositionECEF;

    updateReadout(screenPosition, pickedPositionECEF);

    if (!currentOptions.showDisc || !pickedPositionECEF) {
      clearDiscPrimitive();
      return;
    }

    const sampledSurfaceNormal = samplePreferredPointQuerySurfaceNormal(
      scene,
      pointerScreenPosition,
      pickedPositionECEF,
      {
        previousSurfaceNormalECEF: previousSurfaceNormal,
      }
    );
    previousSurfaceNormal = sampledSurfaceNormal
      ? Cartesian3.clone(
          sampledSurfaceNormal,
          previousSurfaceNormal ?? new Cartesian3()
        )
      : null;

    const discNormal = resolveDiscNormal(
      pickedPositionECEF,
      sampledSurfaceNormal ?? null
    );
    const discRadius = Math.max(
      currentOptions.discRadiusMeters,
      0.1
    );
    const sampledRadius = resolvePointPreviewDiscRadius({
      scene,
      pointECEF: pickedPositionECEF,
      discNormalECEF: discNormal,
      radiusMeters: discRadius,
      scalingMode: currentOptions.discScalingMode,
      targetScreenRadiusCssPx:
        currentOptions.targetScreenRadiusCssPx ??
        pointPreviewRingVisualDefaults.targetScreenRadiusCssPx,
    });
    const activeDiscPrimitive = ensureDiscPrimitive();
    activeDiscPrimitive.modelMatrix = createOrientedDiscModelMatrix(
      pickedPositionECEF,
      discNormal,
      sampledRadius,
      activeDiscPrimitive.modelMatrix
    );
    markDiscUpdateEvent();
  };

  const queueRender = () => {
    if (discNeedsRender || scene.isDestroyed()) {
      return;
    }

    discNeedsRender = true;
    scene.requestRender();
  };

  const removePreRenderListener = scene.preRender.addEventListener(() => {
    if (!discNeedsRender) {
      return;
    }

    renderDiscAndReadout();
  });

  const unsubscribeClientPosition = subscribeCesiumScenePointerClientPosition(
    scene,
    () => {
      markMousePositionEvent();
      queueRender();
    }
  );
  const performanceIntervalId = window.setInterval(() => {
    updatePerformanceStats();
  }, PERFORMANCE_REPORT_INTERVAL_MS);

  applyCursorVisibility();
  updatePerformanceStats(true);
  queueRender();

  return {
    updateOptions: (nextOptions) => {
      const primitiveDefinitionChanged =
        currentOptions.discColor !== nextOptions.discColor ||
        currentOptions.discOpacity !== nextOptions.discOpacity ||
        currentOptions.discMaterialPreset !==
          nextOptions.discMaterialPreset ||
        currentOptions.innerHoleRadiusRatio !== nextOptions.innerHoleRadiusRatio;
      currentOptions = nextOptions;
      applyCursorVisibility();
      if (primitiveDefinitionChanged) {
        clearDiscPrimitive();
      }
      queueRender();
    },
    destroy: () => {
      removePreRenderListener?.();
      unsubscribeClientPosition();
      unregisterPointerTracker();
      window.clearInterval(performanceIntervalId);
      clearDiscPrimitive();
      updateReadout(null, null);
      if (mousePositionRateElement) {
        mousePositionRateElement.textContent = "mouse 0.0 Hz";
      }
      if (sampleRateElement) {
        sampleRateElement.textContent = "sample 0.0 Hz";
      }
      if (discUpdateRateElement) {
        discUpdateRateElement.textContent = "disc 0.0 Hz";
      }
      if (!scene.isDestroyed()) {
        scene.canvas.style.cursor = "";
      }
    },
  };
};
