import { computeCesiumSceneStateSnapshot } from "@carma-mapping/engines/cesium/api";
import type {
  EventLike,
  SceneLike,
  SceneStateOptions,
  SceneStateSnapshot,
} from "@carma/types";

export type CesiumSceneStateStore = {
  getSnapshot: () => SceneStateSnapshot | null;
  subscribe: (listener: () => void) => () => void;
  refresh: () => SceneStateSnapshot | null;
  destroy: () => void;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isEventLike = (value: unknown): value is EventLike => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };
  return (
    typeof candidate.addEventListener === "function" &&
    typeof candidate.removeEventListener === "function"
  );
};

const nowMs = (): number => Date.now();

const readFrameNumber = (scene: SceneLike): number | null => {
  const frameNumber = scene.frameState?.frameNumber;
  return isFiniteNumber(frameNumber) ? frameNumber : null;
};

export const createCesiumSceneStateStore = (
  scene: SceneLike,
  options: SceneStateOptions = {}
): CesiumSceneStateStore => {
  const listeners = new Set<() => void>();
  const scenePreRender = scene.preRender;
  const scenePostRender = scene.postRender;

  let isDestroyed = false;
  let snapshot: SceneStateSnapshot | null = null;
  let lastResolvedFrameNumber: number | null = null;

  // Compute at most once for the current frame number.
  const computeSnapshot = (force: boolean): SceneStateSnapshot | null => {
    if (isDestroyed) {
      return snapshot;
    }

    const frameNumber = readFrameNumber(scene);
    if (!force) {
      if (frameNumber === null) {
        if (snapshot) {
          return snapshot;
        }
      } else if (frameNumber === lastResolvedFrameNumber) {
        return snapshot;
      }
    }

    const resolvedFrameNumber =
      frameNumber ??
      (lastResolvedFrameNumber === null ? 0 : lastResolvedFrameNumber + 1);
    lastResolvedFrameNumber = resolvedFrameNumber;

    snapshot = computeCesiumSceneStateSnapshot(scene, options, {
      frameNumber: resolvedFrameNumber,
      timestampMs: nowMs(),
    });
    return snapshot;
  };

  const notifyListeners = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const onFrame = () => {
    const previousSnapshot = snapshot;
    const nextSnapshot = computeSnapshot(true);
    if (nextSnapshot !== previousSnapshot) {
      notifyListeners();
    }
  };

  if (isEventLike(scenePreRender)) {
    scenePreRender.addEventListener(onFrame);
  } else if (isEventLike(scenePostRender)) {
    scenePostRender.addEventListener(onFrame);
  }

  return {
    getSnapshot: () => computeSnapshot(false),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh: () => {
      const previousSnapshot = snapshot;
      const nextSnapshot = computeSnapshot(true);
      if (nextSnapshot !== previousSnapshot) {
        notifyListeners();
      }
      return nextSnapshot;
    },
    destroy: () => {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      if (isEventLike(scenePostRender)) {
        scenePostRender.removeEventListener(onFrame);
      }
      if (isEventLike(scenePreRender)) {
        scenePreRender.removeEventListener(onFrame);
      }
      listeners.clear();
    },
  };
};
