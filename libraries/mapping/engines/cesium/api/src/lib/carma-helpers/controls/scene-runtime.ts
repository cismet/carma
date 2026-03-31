import type { CesiumWidget, Scene } from "@carma/cesium";

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
