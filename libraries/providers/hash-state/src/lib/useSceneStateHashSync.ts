import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SceneStateSnapshot } from "@carma/types";
import { useHashState } from "./HashStateProvider";
import {
  DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY,
  DEFAULT_SCENE_STATE_HASH_KEY,
  sceneStateHashCodec,
  type SceneStateHashEncodeScheme,
} from "./sceneStateHashCodec";
import {
  readMapLibreCompatHashParamsFromSceneState,
  readSceneStateHashSnapshotFromCamera,
} from "./sceneStateHashCameraAdapter";
import { readSceneStateHashSnapshotFromSceneState } from "./sceneStateHashSceneAdapter";
import type {
  SceneStateCameraLike,
  SceneStateLike,
} from "./sceneStateHashCameraTypes";
import type { SceneStateAnchorMode } from "./sceneStateHashSceneAdapter";

export type {
  SceneStateCameraLike,
  SceneStateLike,
} from "./sceneStateHashCameraTypes";

type SceneStateSyncEventLike = {
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
  "camera3d",
] as const;

export type UseSceneStateHashSyncOptions = {
  sceneState?: SceneStateSnapshot | null;
  scene?: SceneStateLike | null;
  camera?: SceneStateCameraLike | null;
  enabled?: boolean;
  hashKey?: string;
  hashAlias?: string;
  encodeScheme?: SceneStateHashEncodeScheme;
  includeIs3dFlag?: boolean;
  is3dFlagKey?: string;
  is3dFlagValue?: number | string;
  clearKeys?: string[];
  replace?: boolean;
  label?: string;
  anchorMode?: SceneStateAnchorMode;
  fallbackHeightM?: number;
  minUpdateIntervalMs?: number;
  altitudeKey?: string;
  rangeKey?: string;
  includeAltitude?: boolean;
  defaultFovDeg?: number;
  mapLibreMinPitchDeg?: number;
  mapLibreMaxPitchDeg?: number;
};

const nowMs = (): number => Date.now();

const resolveSceneStateSyncEvent = (
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

const toUniqueKeys = (keys: readonly string[]): string[] =>
  Array.from(new Set(keys.filter((key) => key.length > 0)));

const readSchemeClearKeys = ({
  encodeScheme,
  hashKey,
  hashAlias,
  altitudeKey,
}: {
  encodeScheme: SceneStateHashEncodeScheme;
  hashKey: string;
  hashAlias: string;
  altitudeKey: string;
}): string[] => {
  return toUniqueKeys([
    hashKey,
    hashAlias,
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

export const useSceneStateHashSync = ({
  sceneState,
  scene,
  camera,
  enabled = true,
  hashKey = DEFAULT_SCENE_STATE_HASH_KEY,
  hashAlias = DEFAULT_SCENE_STATE_HASH_KEY,
  encodeScheme = "carma-maplibre-plus-elevation",
  includeIs3dFlag = true,
  is3dFlagKey = "is3d",
  is3dFlagValue = 1,
  clearKeys,
  replace = true,
  label = "SceneState:camera",
  anchorMode = "screen-center",
  fallbackHeightM = 200,
  minUpdateIntervalMs = 100,
  altitudeKey = DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY,
  rangeKey = "range",
  includeAltitude = false,
  defaultFovDeg,
  mapLibreMinPitchDeg = 0,
  mapLibreMaxPitchDeg = 85,
}: UseSceneStateHashSyncOptions): void => {
  void rangeKey;
  void includeAltitude;

  const { updateHash } = useHashState();
  const lastEncodedRef = useRef<string | undefined>(undefined);
  const lastUpdateTsRef = useRef<number>(0);
  const resolvedClearKeys = useMemo(
    () =>
      toUniqueKeys([
        ...readSchemeClearKeys({
          encodeScheme,
          hashKey,
          hashAlias,
          altitudeKey,
        }),
        ...(clearKeys ?? DEFAULT_SCENE_STATE_HASH_CLEAR_KEYS),
      ]),
    [altitudeKey, clearKeys, encodeScheme, hashAlias, hashKey]
  );

  const writeCameraHash = useCallback(
    (replaceHash: boolean) => {
      const snapshotFromSceneState = readSceneStateHashSnapshotFromSceneState({
        sceneState,
        anchorMode,
        fallbackHeightM,
      });

      const resolvedCamera = camera ?? scene?.camera;
      const snapshot =
        snapshotFromSceneState ??
        (resolvedCamera
          ? readSceneStateHashSnapshotFromCamera({
              camera: resolvedCamera,
              scene,
              anchorMode,
              fallbackHeightM,
            })
          : null);
      if (!snapshot) {
        return;
      }

      const encoded = sceneStateHashCodec.encode(snapshot);
      if (!encoded) {
        return;
      }
      if (encoded === lastEncodedRef.current) {
        return;
      }
      lastEncodedRef.current = encoded;

      const params: Record<string, unknown> = {};
      Object.assign(
        params,
        readMapLibreCompatHashParamsFromSceneState({
          snapshot,
          sceneState,
          scene,
          camera: resolvedCamera,
          includeAltitude: true,
          altitudeKey,
          defaultFovDeg,
          minPitchDeg: mapLibreMinPitchDeg,
          maxPitchDeg: mapLibreMaxPitchDeg,
        })
      );
      if (includeIs3dFlag) {
        params[is3dFlagKey] = is3dFlagValue;
      }

      updateHash(params, {
        clearKeys: resolvedClearKeys,
        label,
        replace: replaceHash,
      });
    },
    [
      anchorMode,
      camera,
      fallbackHeightM,
      includeIs3dFlag,
      is3dFlagKey,
      is3dFlagValue,
      label,
      defaultFovDeg,
      mapLibreMinPitchDeg,
      mapLibreMaxPitchDeg,
      resolvedClearKeys,
      sceneState,
      scene,
      updateHash,
    ]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (sceneState) {
      const now = nowMs();
      const isInitialWrite = lastEncodedRef.current === undefined;
      if (
        !isInitialWrite &&
        now - lastUpdateTsRef.current < minUpdateIntervalMs
      ) {
        return;
      }
      lastUpdateTsRef.current = now;
      writeCameraHash(isInitialWrite ? true : replace);
      return;
    }

    const resolvedCamera = camera ?? scene?.camera;
    if (!resolvedCamera) {
      return;
    }

    writeCameraHash(true);

    const event = resolveSceneStateSyncEvent(scene, resolvedCamera);
    if (!event) {
      return;
    }

    const listener = () => {
      const now = nowMs();
      if (now - lastUpdateTsRef.current < minUpdateIntervalMs) {
        return;
      }
      lastUpdateTsRef.current = now;
      writeCameraHash(replace);
    };

    event.addEventListener(listener);
    return () => {
      event.removeEventListener(listener);
    };
  }, [
    camera,
    enabled,
    minUpdateIntervalMs,
    replace,
    scene,
    sceneState,
    writeCameraHash,
  ]);
};
