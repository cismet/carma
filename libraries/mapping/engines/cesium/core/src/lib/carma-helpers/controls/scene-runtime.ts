import { clamp } from "@carma-commons/math";
import type { CesiumWidget, Scene } from "@carma-cesium";

type DestroyableLike = {
  isDestroyed?: () => boolean;
};

type CesiumWidgetLike = DestroyableLike & {
  scene?: CesiumSceneLike | null;
};

export type CesiumSceneLike = Scene & DestroyableLike;

export type CesiumSceneTarget =
  | CesiumSceneLike
  | CesiumWidgetLike
  | CesiumWidget
  | null
  | undefined;

export type CesiumPreRenderLoopState = {
  removePreRenderListener: (() => void) | null;
  renderRequested: boolean;
};

export const CESIUM_PRE_RENDER_STOP_REASONS = {
  COMPLETED: "completed",
  CANCELED: "canceled",
  DESTROYED: "destroyed",
} as const;

export type CesiumPreRenderStopReason =
  (typeof CESIUM_PRE_RENDER_STOP_REASONS)[keyof typeof CESIUM_PRE_RENDER_STOP_REASONS];

export type CesiumPreRenderTimelineStepContext = {
  nowMs: number;
  progress: number;
};

export type CesiumPreRenderDeltaStepContext = {
  nowMs: number;
  deltaMs: number;
};

const isDestroyedLike = (
  value: DestroyableLike | null | undefined
): boolean => {
  try {
    return value?.isDestroyed?.() ?? false;
  } catch {
    return true;
  }
};

const isCesiumSceneLike = (
  value: CesiumSceneTarget
): value is CesiumSceneLike =>
  Boolean(
    value &&
      typeof value === "object" &&
      "camera" in value &&
      ("preRender" in value ||
        "postRender" in value ||
        "pickPosition" in value ||
        "globe" in value)
  );

export const readCesiumScene = (
  sceneOrWidget: CesiumSceneTarget
): CesiumSceneLike | null => {
  if (!sceneOrWidget || isDestroyedLike(sceneOrWidget)) {
    return null;
  }

  const nestedScene = "scene" in sceneOrWidget ? sceneOrWidget.scene : null;
  if (nestedScene && !isDestroyedLike(nestedScene)) {
    return nestedScene as CesiumSceneLike;
  }

  if (isCesiumSceneLike(sceneOrWidget)) {
    return sceneOrWidget;
  }

  return null;
};

export const requestCesiumRender = (sceneOrWidget: CesiumSceneTarget) => {
  const scene = readCesiumScene(sceneOrWidget);
  if (!scene) {
    return;
  }

  try {
    scene.requestRender?.();
  } catch {
    // Ignore transient teardown races.
  }
};

export const bindCesiumFrameListener = (
  sceneOrWidget: CesiumSceneTarget,
  listener: () => void
): (() => void) | null => {
  const scene = readCesiumScene(sceneOrWidget);
  const frameEvent = scene?.postRender ?? scene?.preRender;
  if (!frameEvent) {
    return null;
  }

  try {
    frameEvent.addEventListener(listener);
  } catch {
    return null;
  }

  return () => {
    try {
      frameEvent.removeEventListener(listener);
    } catch {
      // Ignore transient teardown races.
    }
  };
};

export const bindCesiumCameraChangedListener = (
  sceneOrWidget: CesiumSceneTarget,
  listener: () => void
): (() => void) | null => {
  const scene = readCesiumScene(sceneOrWidget);
  const changedEvent = scene?.camera?.changed;
  if (!changedEvent) {
    return null;
  }

  try {
    changedEvent.addEventListener(listener);
  } catch {
    return null;
  }

  return () => {
    try {
      changedEvent.removeEventListener(listener);
    } catch {
      // Ignore transient teardown races.
    }
  };
};

export const startCesiumPreRenderTimeline = (
  sceneOrWidget: CesiumSceneTarget,
  state: CesiumPreRenderLoopState,
  {
    startedAtMs,
    durationMs,
    onStep,
    onStop,
  }: {
    startedAtMs: number;
    durationMs: number;
    onStep: (
      context: CesiumPreRenderTimelineStepContext
    ) => CesiumPreRenderStopReason | void;
    onStop?: (reason: CesiumPreRenderStopReason) => void;
  }
) => {
  const scene = readCesiumScene(sceneOrWidget);
  if (!scene || state.removePreRenderListener) {
    return null;
  }

  const requestNextRender = () => {
    if (state.renderRequested) {
      return;
    }

    state.renderRequested = true;
    requestCesiumRender(scene);
  };

  const stop = (reason: CesiumPreRenderStopReason) => {
    state.removePreRenderListener?.();
    state.removePreRenderListener = null;
    state.renderRequested = false;
    onStop?.(reason);
  };

  const step = () => {
    state.renderRequested = false;

    if (scene.isDestroyed()) {
      stop(CESIUM_PRE_RENDER_STOP_REASONS.DESTROYED);
      return;
    }

    const nowMs = performance.now();
    const progress =
      durationMs > 0 ? clamp((nowMs - startedAtMs) / durationMs, 0, 1) : 1;
    const resolvedReason = onStep({ nowMs, progress });

    if (resolvedReason) {
      stop(resolvedReason);
      return;
    }

    if (progress < 1) {
      requestNextRender();
      return;
    }

    stop(CESIUM_PRE_RENDER_STOP_REASONS.COMPLETED);
  };

  state.removePreRenderListener = scene.preRender.addEventListener(() => {
    step();
  });
  requestNextRender();

  return {
    requestNextRender,
    stop,
  };
};

export const startCesiumPreRenderDeltaLoop = (
  sceneOrWidget: CesiumSceneTarget,
  state: CesiumPreRenderLoopState,
  {
    onStep,
    onStop,
  }: {
    onStep: (
      context: CesiumPreRenderDeltaStepContext
    ) => CesiumPreRenderStopReason | void;
    onStop?: (reason: CesiumPreRenderStopReason) => void;
  }
) => {
  const scene = readCesiumScene(sceneOrWidget);
  if (!scene || state.removePreRenderListener) {
    return null;
  }

  let lastNowMs: number | null = null;

  const requestNextRender = () => {
    if (state.renderRequested) {
      return;
    }

    state.renderRequested = true;
    requestCesiumRender(scene);
  };

  const stop = (reason: CesiumPreRenderStopReason) => {
    state.removePreRenderListener?.();
    state.removePreRenderListener = null;
    state.renderRequested = false;
    lastNowMs = null;
    onStop?.(reason);
  };

  const step = () => {
    state.renderRequested = false;

    if (scene.isDestroyed()) {
      stop(CESIUM_PRE_RENDER_STOP_REASONS.DESTROYED);
      return;
    }

    const nowMs = performance.now();
    const deltaMs = lastNowMs === null ? 0 : Math.max(0, nowMs - lastNowMs);
    lastNowMs = nowMs;

    const resolvedReason = onStep({ nowMs, deltaMs });
    if (resolvedReason) {
      stop(resolvedReason);
      return;
    }

    requestNextRender();
  };

  state.removePreRenderListener = scene.preRender.addEventListener(() => {
    step();
  });
  requestNextRender();

  return {
    requestNextRender,
    stop,
  };
};
