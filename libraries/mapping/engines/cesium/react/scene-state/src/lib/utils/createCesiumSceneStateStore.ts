import { isFiniteNumber } from "@carma/math";
import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { Store } from "redux";
import type {
  EventLike,
  SceneLike,
  SceneStateOptions,
  SceneState,
} from "../types";
import { computeCesiumSceneState } from "./computeCesiumSceneStateSnapshot";
import {
  serializeSceneState,
  type SerializedSceneState,
} from "./sceneStateSerialization";
import {
  errorFromJson,
  errorToJson,
  type SerializedError,
} from "@carma/cesium";

export type CesiumSceneStateStoreState = {
  snapshot: SerializedSceneState | null;
  error: SerializedError | null;
};

export type CesiumSceneStateStore = Store<CesiumSceneStateStoreState> & {
  getSnapshot: () => SceneState | null;
  getError: () => Error | null;
  refresh: () => SceneState | null;
  destroy: () => void;
};

const sceneStateSlice = createSlice({
  name: "cesiumSceneState",
  initialState: {
    snapshot: null,
    error: null,
  } as CesiumSceneStateStoreState,
  reducers: {
    setSceneState: (
      state,
      action: PayloadAction<CesiumSceneStateStoreState>
    ) => {
      state.snapshot = action.payload.snapshot;
      state.error = action.payload.error;
    },
  },
});

const { setSceneState } = sceneStateSlice.actions;

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const isMissingScreenCenterIntersectionError = (error: unknown): boolean =>
  normalizeError(error).message.includes("Missing screen-center intersection");

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
  const reduxStore = configureStore({
    reducer: sceneStateSlice.reducer,
  });
  const scenePreRender = scene.preRender;
  const scenePostRender = scene.postRender;

  let isDestroyed = false;
  let snapshot: SceneState | null = null;
  let lastError: Error | null = null;
  let lastResolvedFrameNumber: number | null = null;
  let serializedSnapshot: SerializedSceneState | null = null;
  let serializedError: SerializedError | null = null;
  let serializedSnapshotSource: SceneState | null = null;
  let serializedErrorSource: Error | null = null;
  let deserializedErrorCacheSource: SerializedError | null = null;
  let deserializedErrorCache: Error | null = null;

  const syncStoreState = () => {
    if (snapshot !== serializedSnapshotSource) {
      serializedSnapshot = serializeSceneState(snapshot);
      serializedSnapshotSource = snapshot;
    }
    if (lastError !== serializedErrorSource) {
      serializedError = errorToJson(lastError);
      serializedErrorSource = lastError;
    }

    const currentStoreState = reduxStore.getState();
    if (
      currentStoreState.snapshot !== serializedSnapshot ||
      currentStoreState.error !== serializedError
    ) {
      reduxStore.dispatch(
        setSceneState({
          snapshot: serializedSnapshot,
          error: serializedError,
        })
      );
    }
  };

  const computeSnapshotForFrame = (
    resolvedFrameNumber: number
  ): SceneState | null =>
    computeCesiumSceneState(scene, options, {
      frameNumber: resolvedFrameNumber,
      timestampMs: nowMs(),
      source: "framework",
    });

  const computeFallbackSnapshotForFrame = (
    resolvedFrameNumber: number
  ): SceneState | null =>
    computeCesiumSceneState(
      scene,
      {
        ...options,
        throwOnMissingScreenCenterIntersection: false,
      },
      {
        frameNumber: resolvedFrameNumber,
        timestampMs: nowMs(),
        source: "framework",
      }
    );

  // Compute at most once for the current frame number.
  const computeSnapshot = (force: boolean): SceneState | null => {
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

    try {
      snapshot = computeSnapshotForFrame(resolvedFrameNumber);
      lastError = null;
    } catch (error) {
      lastError = normalizeError(error);

      if (
        options.throwOnMissingScreenCenterIntersection &&
        isMissingScreenCenterIntersectionError(error)
      ) {
        try {
          snapshot = computeFallbackSnapshotForFrame(resolvedFrameNumber);
        } catch (fallbackError) {
          lastError = normalizeError(fallbackError);
        }
      }
    }

    return snapshot;
  };

  const computeAndSync = (force: boolean): SceneState | null => {
    const previousSnapshot = snapshot;
    const previousError = lastError;
    const nextSnapshot = computeSnapshot(force);
    if (nextSnapshot !== previousSnapshot || lastError !== previousError) {
      syncStoreState();
    }
    return nextSnapshot;
  };

  const onFrame = () => {
    computeAndSync(true);
  };

  if (isEventLike(scenePreRender)) {
    scenePreRender.addEventListener(onFrame);
  } else if (isEventLike(scenePostRender)) {
    scenePostRender.addEventListener(onFrame);
  }

  computeAndSync(true);

  const getSnapshot = () => {
    computeAndSync(false);
    return snapshot;
  };

  const getError = () => {
    computeAndSync(false);
    const serialized = reduxStore.getState().error;
    if (serialized === deserializedErrorCacheSource) {
      return deserializedErrorCache;
    }
    const deserialized = errorFromJson(serialized);
    deserializedErrorCacheSource = serialized;
    deserializedErrorCache = deserialized;
    return deserialized;
  };

  const refresh = () => {
    computeAndSync(true);
    return getSnapshot();
  };

  const destroy = () => {
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
  };

  return Object.assign(reduxStore, {
    getSnapshot,
    getError,
    refresh,
    destroy,
  });
};
