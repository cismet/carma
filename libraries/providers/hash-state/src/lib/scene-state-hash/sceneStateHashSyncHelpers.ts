import type {
  SceneStateCameraLike,
  SceneStateLike,
} from "./sceneStateHashCameraTypes";

export type SceneStateSyncEventLike = {
  addEventListener: (listener: () => void) => void;
  removeEventListener: (listener: () => void) => void;
};

export const DEFAULT_SCENE_STATE_HASH_CLEAR_KEYS = [
  "lat",
  "lng",
  "zoom",
  "altitude",
  "bearing",
  "pitch",
  "fov",
  "is2d",
  "is3d",
] as const;

export const toUniqueKeys = (keys: readonly string[]): string[] =>
  Array.from(new Set(keys.filter((key) => key.length > 0)));

export const readSchemeClearKeys = ({
  altitudeKey,
}: {
  altitudeKey: string;
}): string[] => {
  return toUniqueKeys([
    altitudeKey,
    "lat",
    "lng",
    "zoom",
    "bearing",
    "pitch",
    "fov",
    "is2d",
    "is3d",
  ]);
};

export const resolveSceneStateSyncEvent = (
  scene: SceneStateLike | null | undefined,
  camera: SceneStateCameraLike
): SceneStateSyncEventLike | null => {
  const cameraMoveEnd = (camera as { moveEnd?: SceneStateSyncEventLike })
    .moveEnd;
  if (
    cameraMoveEnd &&
    typeof cameraMoveEnd.addEventListener === "function" &&
    typeof cameraMoveEnd.removeEventListener === "function"
  ) {
    return cameraMoveEnd;
  }

  const cameraChanged = (camera as { changed?: SceneStateSyncEventLike })
    .changed;
  if (
    cameraChanged &&
    typeof cameraChanged.addEventListener === "function" &&
    typeof cameraChanged.removeEventListener === "function"
  ) {
    return cameraChanged;
  }

  const scenePostRender = scene
    ? (scene as { postRender?: SceneStateSyncEventLike }).postRender
    : undefined;
  if (
    scenePostRender &&
    typeof scenePostRender.addEventListener === "function" &&
    typeof scenePostRender.removeEventListener === "function"
  ) {
    return scenePostRender;
  }

  return null;
};