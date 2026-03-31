import type { CesiumWidget } from "@carma/cesium";
import { readCesiumScene, requestCesiumRender, type CesiumSceneLike, type CesiumSceneTarget } from "./scene-runtime";

export const DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS = [
  1,
  0.875,
  0.75,
  2 / 3,
  0.625,
  0.5,
] as const;

export type CesiumAdaptiveRenderScaleBindings = {
  getRenderScale: () => number;
  setRenderScale: (scale: number) => void;
  resize?: () => void;
  requestRender?: () => void;
};

export type CesiumAdaptiveRenderScaleOptions = {
  targetFps?: number;
  minimumScale?: number;
  maximumScale?: number;
  scaleSteps?: readonly number[];
  benchmarkBlend?: number;
  minimumAdjustmentIntervalMs?: number;
  idleRestoreDelayMs?: number;
  upscaleHeadroomRatio?: number;
  downscaleToleranceRatio?: number;
};

export type CesiumAdaptiveRenderScaleStatus = {
  active: boolean;
  targetFps: number;
  renderScale: number;
  measuredFps: number | null;
  averageRenderMs: number | null;
  pixelsPerMsEstimate: number | null;
  drawingBufferPixels: number | null;
  basePixelCountAtScaleOne: number | null;
};

type CesiumAdaptiveRenderScaleListener = (
  status: CesiumAdaptiveRenderScaleStatus
) => void;

type CesiumAdaptiveRenderScaleController = {
  scene: CesiumSceneLike;
  bindings: CesiumAdaptiveRenderScaleBindings;
  settings: Required<CesiumAdaptiveRenderScaleOptions>;
  activeKeys: Set<string>;
  listeners: Set<CesiumAdaptiveRenderScaleListener>;
  removePreRenderListener: (() => void) | null;
  removePostRenderListener: (() => void) | null;
  currentFrameStartedAtMs: number | null;
  averageRenderMs: number | null;
  measuredFps: number | null;
  pixelsPerMsEstimate: number | null;
  basePixelCountAtScaleOne: number | null;
  lastAdjustmentAtMs: number;
  restingRenderScale: number;
  idleRestoreTimer: ReturnType<typeof setTimeout> | null;
  status: CesiumAdaptiveRenderScaleStatus;
};

const DEFAULT_TARGET_FPS = 60;
const DEFAULT_MINIMUM_SCALE = 0.5;
const DEFAULT_MAXIMUM_SCALE = 1;
const DEFAULT_BENCHMARK_BLEND = 0.2;
const DEFAULT_MINIMUM_ADJUSTMENT_INTERVAL_MS = 140;
const DEFAULT_IDLE_RESTORE_DELAY_MS = 260;
const DEFAULT_UPSCALE_HEADROOM_RATIO = 0.82;
const DEFAULT_DOWNSCALE_TOLERANCE_RATIO = 1.04;
const DEFAULT_ACTIVITY_KEY = "default";
const SCALE_EPSILON = 0.0001;

const sceneAdaptiveRenderScaleControllers = new WeakMap<
  CesiumSceneLike,
  CesiumAdaptiveRenderScaleController
>();

const isFinitePositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalizeScaleSteps = (
  scaleSteps: readonly number[],
  minimumScale: number,
  maximumScale: number
) =>
  Array.from(
    new Set(
      scaleSteps.filter(
        (scale) =>
          isFinitePositiveNumber(scale) &&
          scale >= minimumScale - SCALE_EPSILON &&
          scale <= maximumScale + SCALE_EPSILON
      )
    )
  ).sort((left, right) => right - left);

const resolveSettings = (
  options: CesiumAdaptiveRenderScaleOptions = {}
): Required<CesiumAdaptiveRenderScaleOptions> => {
  const targetFps = isFinitePositiveNumber(options.targetFps)
    ? options.targetFps
    : DEFAULT_TARGET_FPS;
  const minimumScale = isFinitePositiveNumber(options.minimumScale)
    ? options.minimumScale
    : DEFAULT_MINIMUM_SCALE;
  const maximumScale = isFinitePositiveNumber(options.maximumScale)
    ? options.maximumScale
    : DEFAULT_MAXIMUM_SCALE;
  const lowerBound = Math.min(minimumScale, maximumScale);
  const upperBound = Math.max(minimumScale, maximumScale);
  const scaleSteps = normalizeScaleSteps(
    options.scaleSteps ?? DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS,
    lowerBound,
    upperBound
  );

  return {
    targetFps,
    minimumScale: lowerBound,
    maximumScale: upperBound,
    scaleSteps:
      scaleSteps.length > 0
        ? scaleSteps
        : normalizeScaleSteps(
            DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS,
            lowerBound,
            upperBound
          ),
    benchmarkBlend:
      typeof options.benchmarkBlend === "number" &&
      Number.isFinite(options.benchmarkBlend) &&
      options.benchmarkBlend > 0 &&
      options.benchmarkBlend <= 1
        ? options.benchmarkBlend
        : DEFAULT_BENCHMARK_BLEND,
    minimumAdjustmentIntervalMs:
      typeof options.minimumAdjustmentIntervalMs === "number" &&
      Number.isFinite(options.minimumAdjustmentIntervalMs) &&
      options.minimumAdjustmentIntervalMs >= 0
        ? options.minimumAdjustmentIntervalMs
        : DEFAULT_MINIMUM_ADJUSTMENT_INTERVAL_MS,
    idleRestoreDelayMs:
      typeof options.idleRestoreDelayMs === "number" &&
      Number.isFinite(options.idleRestoreDelayMs) &&
      options.idleRestoreDelayMs >= 0
        ? options.idleRestoreDelayMs
        : DEFAULT_IDLE_RESTORE_DELAY_MS,
    upscaleHeadroomRatio:
      typeof options.upscaleHeadroomRatio === "number" &&
      Number.isFinite(options.upscaleHeadroomRatio) &&
      options.upscaleHeadroomRatio > 0 &&
      options.upscaleHeadroomRatio <= 1
        ? options.upscaleHeadroomRatio
        : DEFAULT_UPSCALE_HEADROOM_RATIO,
    downscaleToleranceRatio:
      typeof options.downscaleToleranceRatio === "number" &&
      Number.isFinite(options.downscaleToleranceRatio) &&
      options.downscaleToleranceRatio >= 1
        ? options.downscaleToleranceRatio
        : DEFAULT_DOWNSCALE_TOLERANCE_RATIO,
  };
};

const clampScale = (
  scale: number,
  minimumScale: number,
  maximumScale: number
) =>
  Math.min(Math.max(scale, minimumScale), maximumScale);

const readCurrentScenePixelCount = (scene: CesiumSceneLike): number | null =>
  isFinitePositiveNumber(scene.drawingBufferWidth) &&
  isFinitePositiveNumber(scene.drawingBufferHeight)
    ? scene.drawingBufferWidth * scene.drawingBufferHeight
    : null;

const applyRenderScale = (
  controller: CesiumAdaptiveRenderScaleController,
  nextRenderScale: number
) => {
  const clampedRenderScale = clampScale(
    nextRenderScale,
    controller.settings.minimumScale,
    controller.settings.maximumScale
  );
  const currentRenderScale = controller.bindings.getRenderScale();

  if (
    !isFinitePositiveNumber(clampedRenderScale) ||
    (isFinitePositiveNumber(currentRenderScale) &&
      Math.abs(currentRenderScale - clampedRenderScale) < SCALE_EPSILON)
  ) {
    return;
  }

  controller.bindings.setRenderScale(clampedRenderScale);
  controller.bindings.resize?.();
  (controller.bindings.requestRender ?? (() => requestCesiumRender(controller.scene)))();
};

const updateStatus = (controller: CesiumAdaptiveRenderScaleController) => {
  controller.status = {
    active: controller.activeKeys.size > 0,
    targetFps: controller.settings.targetFps,
    renderScale: controller.bindings.getRenderScale(),
    measuredFps: controller.measuredFps,
    averageRenderMs: controller.averageRenderMs,
    pixelsPerMsEstimate: controller.pixelsPerMsEstimate,
    drawingBufferPixels: readCurrentScenePixelCount(controller.scene),
    basePixelCountAtScaleOne: controller.basePixelCountAtScaleOne,
  };

  controller.listeners.forEach((listener) => {
    listener(controller.status);
  });
};

export const readCesiumAdaptiveRenderScaleTarget = ({
  basePixelCountAtScaleOne,
  pixelsPerMsEstimate,
  targetFps,
  minimumScale = DEFAULT_MINIMUM_SCALE,
  maximumScale = DEFAULT_MAXIMUM_SCALE,
}: {
  basePixelCountAtScaleOne: number;
  pixelsPerMsEstimate: number;
  targetFps: number;
  minimumScale?: number;
  maximumScale?: number;
}): number | null => {
  if (
    !isFinitePositiveNumber(basePixelCountAtScaleOne) ||
    !isFinitePositiveNumber(pixelsPerMsEstimate) ||
    !isFinitePositiveNumber(targetFps)
  ) {
    return null;
  }

  const targetFrameMs = 1000 / targetFps;
  const targetPixelBudget = pixelsPerMsEstimate * targetFrameMs;
  const rawRenderScale = Math.sqrt(targetPixelBudget / basePixelCountAtScaleOne);

  return isFinitePositiveNumber(rawRenderScale)
    ? clampScale(rawRenderScale, minimumScale, maximumScale)
    : null;
};

export const quantizeCesiumAdaptiveRenderScale = ({
  targetScale,
  scaleSteps = DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS,
  minimumScale = DEFAULT_MINIMUM_SCALE,
  maximumScale = DEFAULT_MAXIMUM_SCALE,
  mode = "nearest",
}: {
  targetScale: number;
  scaleSteps?: readonly number[];
  minimumScale?: number;
  maximumScale?: number;
  mode?: "nearest" | "down" | "up";
}): number | null => {
  if (!isFinitePositiveNumber(targetScale)) {
    return null;
  }

  const normalizedScaleSteps = normalizeScaleSteps(
    scaleSteps,
    minimumScale,
    maximumScale
  );

  if (normalizedScaleSteps.length === 0) {
    return clampScale(targetScale, minimumScale, maximumScale);
  }

  const clampedTargetScale = clampScale(targetScale, minimumScale, maximumScale);
  const descendingSteps = normalizedScaleSteps;
  const ascendingSteps = [...normalizedScaleSteps].reverse();

  if (mode === "down") {
    return (
      descendingSteps.find((scale) => scale <= clampedTargetScale + SCALE_EPSILON) ??
      descendingSteps[descendingSteps.length - 1]
    );
  }

  if (mode === "up") {
    return (
      ascendingSteps.find((scale) => scale >= clampedTargetScale - SCALE_EPSILON) ??
      ascendingSteps[ascendingSteps.length - 1]
    );
  }

  return descendingSteps.reduce((bestScale, candidateScale) =>
    Math.abs(candidateScale - clampedTargetScale) <
    Math.abs(bestScale - clampedTargetScale)
      ? candidateScale
      : bestScale
  );
};

export const readNextCesiumAdaptiveRenderScaleStep = ({
  currentScale,
  direction,
  scaleSteps = DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS,
  minimumScale = DEFAULT_MINIMUM_SCALE,
  maximumScale = DEFAULT_MAXIMUM_SCALE,
}: {
  currentScale: number;
  direction: "up" | "down";
  scaleSteps?: readonly number[];
  minimumScale?: number;
  maximumScale?: number;
}): number | null => {
  if (!isFinitePositiveNumber(currentScale)) {
    return null;
  }

  const normalizedScaleSteps = normalizeScaleSteps(
    scaleSteps,
    minimumScale,
    maximumScale
  );

  if (normalizedScaleSteps.length === 0) {
    return clampScale(currentScale, minimumScale, maximumScale);
  }

  if (direction === "down") {
    return (
      normalizedScaleSteps.find((scale) => scale < currentScale - SCALE_EPSILON) ??
      normalizedScaleSteps[normalizedScaleSteps.length - 1]
    );
  }

  return (
    [...normalizedScaleSteps]
      .reverse()
      .find((scale) => scale > currentScale + SCALE_EPSILON) ??
    normalizedScaleSteps[0]
  );
};

const detachFrameListeners = (
  controller: CesiumAdaptiveRenderScaleController
) => {
  controller.removePreRenderListener?.();
  controller.removePreRenderListener = null;
  controller.removePostRenderListener?.();
  controller.removePostRenderListener = null;
  controller.currentFrameStartedAtMs = null;
};

const maybeAdjustRenderScale = (
  controller: CesiumAdaptiveRenderScaleController,
  nowMs: number
) => {
  if (
    controller.activeKeys.size === 0 ||
    controller.basePixelCountAtScaleOne === null ||
    controller.pixelsPerMsEstimate === null ||
    !isFinitePositiveNumber(controller.averageRenderMs)
  ) {
    return;
  }

  if (
    nowMs - controller.lastAdjustmentAtMs <
    controller.settings.minimumAdjustmentIntervalMs
  ) {
    return;
  }

  const currentRenderScale = controller.bindings.getRenderScale();
  if (!isFinitePositiveNumber(currentRenderScale)) {
    return;
  }

  const targetRenderScale = readCesiumAdaptiveRenderScaleTarget({
    basePixelCountAtScaleOne: controller.basePixelCountAtScaleOne,
    pixelsPerMsEstimate: controller.pixelsPerMsEstimate,
    targetFps: controller.settings.targetFps,
    minimumScale: controller.settings.minimumScale,
    maximumScale: controller.settings.maximumScale,
  });

  if (targetRenderScale === null) {
    return;
  }

  const conservativeTargetScale = quantizeCesiumAdaptiveRenderScale({
    targetScale: targetRenderScale,
    scaleSteps: controller.settings.scaleSteps,
    minimumScale: controller.settings.minimumScale,
    maximumScale: controller.settings.maximumScale,
    mode: targetRenderScale < currentRenderScale ? "down" : "up",
  });

  if (conservativeTargetScale === null) {
    return;
  }

  const targetFrameMs = 1000 / controller.settings.targetFps;
  let nextRenderScale: number | null = null;

  if (
    controller.averageRenderMs >
      targetFrameMs * controller.settings.downscaleToleranceRatio &&
    conservativeTargetScale < currentRenderScale - SCALE_EPSILON
  ) {
    nextRenderScale = readNextCesiumAdaptiveRenderScaleStep({
      currentScale: currentRenderScale,
      direction: "down",
      scaleSteps: controller.settings.scaleSteps,
      minimumScale: controller.settings.minimumScale,
      maximumScale: controller.settings.maximumScale,
    });
  } else if (
    controller.averageRenderMs <
      targetFrameMs * controller.settings.upscaleHeadroomRatio &&
    conservativeTargetScale > currentRenderScale + SCALE_EPSILON
  ) {
    nextRenderScale = readNextCesiumAdaptiveRenderScaleStep({
      currentScale: currentRenderScale,
      direction: "up",
      scaleSteps: controller.settings.scaleSteps,
      minimumScale: controller.settings.minimumScale,
      maximumScale: controller.settings.maximumScale,
    });
  }

  if (
    nextRenderScale !== null &&
    Math.abs(nextRenderScale - currentRenderScale) >= SCALE_EPSILON
  ) {
    controller.lastAdjustmentAtMs = nowMs;
    applyRenderScale(controller, nextRenderScale);
  }
};

const attachFrameListeners = (
  controller: CesiumAdaptiveRenderScaleController
) => {
  if (controller.removePreRenderListener || controller.removePostRenderListener) {
    return;
  }

  controller.removePreRenderListener = controller.scene.preRender.addEventListener(
    () => {
      controller.currentFrameStartedAtMs = performance.now();
    }
  );

  controller.removePostRenderListener = controller.scene.postRender.addEventListener(
    () => {
      const frameStartedAtMs = controller.currentFrameStartedAtMs;
      controller.currentFrameStartedAtMs = null;

      if (frameStartedAtMs === null) {
        updateStatus(controller);
        return;
      }

      const renderDurationMs = Math.max(performance.now() - frameStartedAtMs, 0.01);
      const alpha = controller.settings.benchmarkBlend;
      const currentRenderScale = controller.bindings.getRenderScale();
      const currentPixelCount = readCurrentScenePixelCount(controller.scene);
      const basePixelCountAtScaleOne =
        currentPixelCount !== null &&
        isFinitePositiveNumber(currentRenderScale)
          ? currentPixelCount / (currentRenderScale * currentRenderScale)
          : null;
      const pixelsPerMs =
        currentPixelCount !== null && renderDurationMs > 0
          ? currentPixelCount / renderDurationMs
          : null;

      controller.averageRenderMs =
        controller.averageRenderMs === null
          ? renderDurationMs
          : controller.averageRenderMs * (1 - alpha) + renderDurationMs * alpha;
      controller.measuredFps =
        controller.averageRenderMs > 0 ? 1000 / controller.averageRenderMs : null;
      controller.basePixelCountAtScaleOne =
        basePixelCountAtScaleOne ?? controller.basePixelCountAtScaleOne;
      controller.pixelsPerMsEstimate =
        pixelsPerMs === null
          ? controller.pixelsPerMsEstimate
          : controller.pixelsPerMsEstimate === null
            ? pixelsPerMs
            : controller.pixelsPerMsEstimate * (1 - alpha) + pixelsPerMs * alpha;

      maybeAdjustRenderScale(controller, performance.now());
      updateStatus(controller);
    }
  );
};

const cancelIdleRestore = (controller: CesiumAdaptiveRenderScaleController) => {
  if (controller.idleRestoreTimer !== null) {
    clearTimeout(controller.idleRestoreTimer);
    controller.idleRestoreTimer = null;
  }
};

const scheduleIdleRestore = (
  controller: CesiumAdaptiveRenderScaleController
) => {
  cancelIdleRestore(controller);
  controller.idleRestoreTimer = setTimeout(() => {
    controller.idleRestoreTimer = null;

    if (controller.activeKeys.size > 0) {
      return;
    }

    detachFrameListeners(controller);
    applyRenderScale(controller, controller.restingRenderScale);
    updateStatus(controller);
  }, controller.settings.idleRestoreDelayMs);
};

const buildInitialStatus = (
  scene: CesiumSceneLike,
  settings: Required<CesiumAdaptiveRenderScaleOptions>,
  bindings: CesiumAdaptiveRenderScaleBindings
): CesiumAdaptiveRenderScaleStatus => ({
  active: false,
  targetFps: settings.targetFps,
  renderScale: bindings.getRenderScale(),
  measuredFps: null,
  averageRenderMs: null,
  pixelsPerMsEstimate: null,
  drawingBufferPixels: readCurrentScenePixelCount(scene),
  basePixelCountAtScaleOne: null,
});

const createController = ({
  scene,
  bindings,
  settings,
}: {
  scene: CesiumSceneLike;
  bindings: CesiumAdaptiveRenderScaleBindings;
  settings: Required<CesiumAdaptiveRenderScaleOptions>;
}): CesiumAdaptiveRenderScaleController => ({
  scene,
  bindings,
  settings,
  activeKeys: new Set<string>(),
  listeners: new Set<CesiumAdaptiveRenderScaleListener>(),
  removePreRenderListener: null,
  removePostRenderListener: null,
  currentFrameStartedAtMs: null,
  averageRenderMs: null,
  measuredFps: null,
  pixelsPerMsEstimate: null,
  basePixelCountAtScaleOne: null,
  lastAdjustmentAtMs: 0,
  restingRenderScale: bindings.getRenderScale(),
  idleRestoreTimer: null,
  status: buildInitialStatus(scene, settings, bindings),
});

const destroyController = (
  controller: CesiumAdaptiveRenderScaleController,
  { restoreScale }: { restoreScale: boolean }
) => {
  cancelIdleRestore(controller);
  detachFrameListeners(controller);
  controller.activeKeys.clear();
  if (restoreScale) {
    applyRenderScale(controller, controller.restingRenderScale);
  }
  updateStatus(controller);
  sceneAdaptiveRenderScaleControllers.delete(controller.scene);
};

export const registerCesiumAdaptiveRenderScaleBindings = (
  sceneOrWidget: CesiumSceneTarget,
  bindings: CesiumAdaptiveRenderScaleBindings,
  options: CesiumAdaptiveRenderScaleOptions = {}
) => {
  const scene = readCesiumScene(sceneOrWidget);
  if (!scene) {
    return () => {};
  }

  const existingController = sceneAdaptiveRenderScaleControllers.get(scene);
  if (existingController) {
    destroyController(existingController, { restoreScale: false });
  }

  const controller = createController({
    scene,
    bindings,
    settings: resolveSettings(options),
  });
  sceneAdaptiveRenderScaleControllers.set(scene, controller);
  updateStatus(controller);

  return () => {
    const activeController = sceneAdaptiveRenderScaleControllers.get(scene);
    if (activeController === controller) {
      destroyController(activeController, { restoreScale: true });
    }
  };
};

type CesiumWidgetAdaptiveRenderScaleTarget = Pick<
  CesiumWidget,
  "isDestroyed" | "resize" | "resolutionScale" | "scene"
>;

export const registerCesiumWidgetAdaptiveRenderScale = (
  widget: CesiumWidgetAdaptiveRenderScaleTarget | null | undefined,
  options: CesiumAdaptiveRenderScaleOptions = {}
) => {
  if (!widget || widget.isDestroyed?.()) {
    return () => {};
  }

  return registerCesiumAdaptiveRenderScaleBindings(
    widget.scene,
    {
      getRenderScale: () => widget.resolutionScale,
      setRenderScale: (scale) => {
        widget.resolutionScale = scale;
      },
      resize: () => {
        widget.resize?.();
      },
      requestRender: () => {
        requestCesiumRender(widget.scene);
      },
    },
    options
  );
};

export const beginCesiumAdaptiveRenderScaleActivity = (
  sceneOrWidget: CesiumSceneTarget,
  activityKey = DEFAULT_ACTIVITY_KEY
) => {
  const scene = readCesiumScene(sceneOrWidget);
  const controller =
    scene !== null ? sceneAdaptiveRenderScaleControllers.get(scene) : undefined;
  if (!scene || !controller) {
    return false;
  }

  cancelIdleRestore(controller);
  const wasInactive = controller.activeKeys.size === 0;
  controller.activeKeys.add(activityKey);

  if (wasInactive) {
    controller.restingRenderScale = controller.bindings.getRenderScale();
    attachFrameListeners(controller);

    const predictedRenderScale =
      controller.basePixelCountAtScaleOne !== null &&
      controller.pixelsPerMsEstimate !== null
        ? quantizeCesiumAdaptiveRenderScale({
            targetScale:
              readCesiumAdaptiveRenderScaleTarget({
                basePixelCountAtScaleOne: controller.basePixelCountAtScaleOne,
                pixelsPerMsEstimate: controller.pixelsPerMsEstimate,
                targetFps: controller.settings.targetFps,
                minimumScale: controller.settings.minimumScale,
                maximumScale: controller.settings.maximumScale,
              }) ?? controller.restingRenderScale,
            scaleSteps: controller.settings.scaleSteps,
            minimumScale: controller.settings.minimumScale,
            maximumScale: controller.settings.maximumScale,
            mode: "down",
          })
        : null;

    if (
      predictedRenderScale !== null &&
      predictedRenderScale < controller.restingRenderScale - SCALE_EPSILON
    ) {
      applyRenderScale(controller, predictedRenderScale);
    } else {
      (controller.bindings.requestRender ?? (() => requestCesiumRender(scene)))();
    }
  }

  updateStatus(controller);
  return true;
};

export const endCesiumAdaptiveRenderScaleActivity = (
  sceneOrWidget: CesiumSceneTarget,
  activityKey = DEFAULT_ACTIVITY_KEY
) => {
  const scene = readCesiumScene(sceneOrWidget);
  const controller =
    scene !== null ? sceneAdaptiveRenderScaleControllers.get(scene) : undefined;
  if (!scene || !controller) {
    return false;
  }

  controller.activeKeys.delete(activityKey);
  if (controller.activeKeys.size === 0) {
    scheduleIdleRestore(controller);
  }

  updateStatus(controller);
  return true;
};

export const readCesiumAdaptiveRenderScaleStatus = (
  sceneOrWidget: CesiumSceneTarget
): CesiumAdaptiveRenderScaleStatus | null => {
  const scene = readCesiumScene(sceneOrWidget);
  if (!scene) {
    return null;
  }

  return sceneAdaptiveRenderScaleControllers.get(scene)?.status ?? null;
};

export const subscribeCesiumAdaptiveRenderScaleStatus = (
  sceneOrWidget: CesiumSceneTarget,
  listener: CesiumAdaptiveRenderScaleListener
) => {
  const scene = readCesiumScene(sceneOrWidget);
  const controller =
    scene !== null ? sceneAdaptiveRenderScaleControllers.get(scene) : undefined;
  if (!scene || !controller) {
    return () => {};
  }

  controller.listeners.add(listener);
  listener(controller.status);

  return () => {
    controller.listeners.delete(listener);
  };
};
