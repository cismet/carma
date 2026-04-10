import { type SceneLike } from "@carma-mapping/engines/cesium/core";

type StoryCesiumWidgetLike = {
  isDestroyed?: () => boolean;
  scene?: SceneLike | null;
};

type StoryCesiumSceneLike = SceneLike & {
  isDestroyed?: () => boolean;
};

const isStoryCesiumSceneLike = (
  value: StoryCesiumWidgetLike | StoryCesiumSceneLike
): value is StoryCesiumSceneLike =>
  "camera" in value &&
  ("preRender" in value ||
    "postRender" in value ||
    "pickPosition" in value ||
    "globe" in value);

const isDestroyedLike = (
  value: { isDestroyed?: () => boolean } | null | undefined
): boolean => {
  try {
    return value?.isDestroyed?.() ?? false;
  } catch {
    return true;
  }
};

export const readStoryCesiumScene = (
  widgetOrScene: StoryCesiumWidgetLike | StoryCesiumSceneLike | null | undefined
): StoryCesiumSceneLike | null => {
  if (!widgetOrScene || isDestroyedLike(widgetOrScene)) {
    return null;
  }

  // CesiumWidget exposes `camera` as well, so prefer the nested `scene`
  // reference before treating the input itself as a scene.
  const nestedScene = "scene" in widgetOrScene ? widgetOrScene.scene : null;
  if (nestedScene && !isDestroyedLike(nestedScene)) {
    return nestedScene as StoryCesiumSceneLike;
  }

  if (isStoryCesiumSceneLike(widgetOrScene)) {
    return widgetOrScene as StoryCesiumSceneLike;
  }
  return null;
};

export const requestStoryCesiumRender = (
  widgetOrScene: StoryCesiumWidgetLike | StoryCesiumSceneLike | null | undefined
) => {
  const scene = readStoryCesiumScene(widgetOrScene);
  if (!scene) {
    return;
  }

  try {
    scene.requestRender?.();
  } catch {
    // Ignore transient HMR / teardown races in Storybook.
  }
};

export const bindStoryCesiumFrameListener = (
  widgetOrScene:
    | StoryCesiumWidgetLike
    | StoryCesiumSceneLike
    | null
    | undefined,
  listener: () => void
): (() => void) | null => {
  const scene = readStoryCesiumScene(widgetOrScene);
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
      // Ignore transient HMR / teardown races in Storybook.
    }
  };
};

export const bindStoryCesiumCameraChangedListener = (
  widgetOrScene:
    | StoryCesiumWidgetLike
    | StoryCesiumSceneLike
    | null
    | undefined,
  listener: () => void
): (() => void) | null => {
  const scene = readStoryCesiumScene(widgetOrScene);
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
      // Ignore transient HMR / teardown races in Storybook.
    }
  };
};
