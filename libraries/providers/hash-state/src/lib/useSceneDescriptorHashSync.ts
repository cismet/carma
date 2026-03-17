import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SceneStateSnapshot } from "@carma/types";
import { useHashState } from "./HashStateProvider";
import {
  DEFAULT_SCENE_DESCRIPTOR_ALTITUDE_HASH_KEY,
  DEFAULT_SCENE_DESCRIPTOR_HASH_ALIAS,
  DEFAULT_SCENE_DESCRIPTOR_HASH_KEY,
  sceneDescriptorHashCodec,
  type SceneDescriptorHashEncodeScheme,
} from "./sceneDescriptorHashCodec";
import {
  readMapLibreCompatHashParamsFromSceneAdapter,
  readSceneDescriptorHashSnapshotFromSceneAdapter,
  readSceneDescriptorHashSnapshotFromSceneState,
  type SceneDescriptorHashSyncCameraLike,
  type SceneDescriptorHashSyncSceneLike,
} from "./sceneDescriptorHashCesiumAdapter";
import type { SceneDescriptorAnchorMode } from "./sceneDescriptorHashSceneStateAdapter";

export type {
  SceneDescriptorHashSyncCameraLike,
  SceneDescriptorHashSyncSceneLike,
} from "./sceneDescriptorHashCesiumAdapter";

type SceneDescriptorSyncEventLike = {
  addEventListener: (listener: () => void) => void;
  removeEventListener: (listener: () => void) => void;
};

export const DEFAULT_SCENE_DESCRIPTOR_HASH_CLEAR_KEYS = [
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
  "c3",
] as const;

export type UseSceneDescriptorHashSyncOptions = {
  sceneState?: SceneStateSnapshot | null;
  scene?: SceneDescriptorHashSyncSceneLike | null;
  camera?: SceneDescriptorHashSyncCameraLike | null;
  enabled?: boolean;
  hashKey?: string;
  hashAlias?: string;
  encodeScheme?: SceneDescriptorHashEncodeScheme;
  includeIs3dFlag?: boolean;
  is3dFlagKey?: string;
  is3dFlagValue?: number | string;
  clearKeys?: string[];
  replace?: boolean;
  label?: string;
  anchorMode?: SceneDescriptorAnchorMode;
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

const resolveSceneDescriptorSyncEvent = (
  scene: SceneDescriptorHashSyncSceneLike | null | undefined,
  camera: SceneDescriptorHashSyncCameraLike
): SceneDescriptorSyncEventLike | null => {
  const cameraMoveEnd = (camera as { moveEnd?: SceneDescriptorSyncEventLike }).moveEnd;
  if (
    cameraMoveEnd &&
    typeof cameraMoveEnd.addEventListener === "function" &&
    typeof cameraMoveEnd.removeEventListener === "function"
  ) {
    return cameraMoveEnd;
  }

  const cameraChanged = (camera as { changed?: SceneDescriptorSyncEventLike }).changed;
  if (
    cameraChanged &&
    typeof cameraChanged.addEventListener === "function" &&
    typeof cameraChanged.removeEventListener === "function"
  ) {
    return cameraChanged;
  }

  const scenePostRender = scene
    ? (scene as { postRender?: SceneDescriptorSyncEventLike }).postRender
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
  encodeScheme: SceneDescriptorHashEncodeScheme;
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

export const useSceneDescriptorHashSync = ({
  sceneState,
  scene,
  camera,
  enabled = true,
  hashKey = DEFAULT_SCENE_DESCRIPTOR_HASH_KEY,
  hashAlias = DEFAULT_SCENE_DESCRIPTOR_HASH_ALIAS,
  encodeScheme = "carma-maplibre-plus-elevation",
  includeIs3dFlag = true,
  is3dFlagKey = "is3d",
  is3dFlagValue = 1,
  clearKeys,
  replace = true,
  label = "SceneDescriptor:camera",
  anchorMode = "screen-center",
  fallbackHeightM = 200,
  minUpdateIntervalMs = 100,
  altitudeKey = DEFAULT_SCENE_DESCRIPTOR_ALTITUDE_HASH_KEY,
  rangeKey = "range",
  includeAltitude = false,
  defaultFovDeg,
  mapLibreMinPitchDeg = 0,
  mapLibreMaxPitchDeg = 85,
}: UseSceneDescriptorHashSyncOptions): void => {
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
        ...(clearKeys ?? DEFAULT_SCENE_DESCRIPTOR_HASH_CLEAR_KEYS),
      ]),
    [altitudeKey, clearKeys, encodeScheme, hashAlias, hashKey]
  );

  const writeCameraHash = useCallback(
    (replaceHash: boolean) => {
      const snapshotFromSceneState = readSceneDescriptorHashSnapshotFromSceneState(
        {
          sceneState,
          anchorMode,
          fallbackHeightM,
        }
      );

      const resolvedCamera = camera ?? scene?.camera;
      const snapshot =
        snapshotFromSceneState ??
        (resolvedCamera
          ? readSceneDescriptorHashSnapshotFromSceneAdapter({
              camera: resolvedCamera,
              scene,
              anchorMode,
              fallbackHeightM,
            })
          : null);
      if (!snapshot) {
        return;
      }

      const encoded = sceneDescriptorHashCodec.encode(snapshot);
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
        readMapLibreCompatHashParamsFromSceneAdapter({
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
      encodeScheme,
      fallbackHeightM,
      hashKey,
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

    const event = resolveSceneDescriptorSyncEvent(scene, resolvedCamera);
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