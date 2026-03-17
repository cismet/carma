import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SceneStateSnapshot } from "@carma/types";
import { useHashState } from "../HashStateProvider";
import { sceneStateHashCodec } from "../scene-state-hash/sceneStateHashCodec";
import {
  readMapLibreCompatHashParamsFromSceneState,
  readSceneStateHashSnapshotFromCamera,
} from "../scene-state-hash/sceneStateHashCameraAdapter";
import { readSceneStateHashSnapshotFromSceneState } from "../scene-state-hash/sceneStateHashSceneAdapter";
import type {
  SceneStateLike,
} from "../scene-state-hash/sceneStateHashCameraTypes";
import type { SceneStateAnchorMode } from "../scene-state-hash/sceneStateHashSceneAdapter";
import {
  DEFAULT_SCENE_STATE_HASH_CLEAR_KEYS,
  readSchemeClearKeys,
  resolveSceneStateSyncEvent,
  toUniqueKeys,
} from "../scene-state-hash/sceneStateHashSyncHelpers";
import {
  DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY,
} from "../scene-state-hash/sceneStateHashTypes";

export type {
  SceneStateLike,
} from "../scene-state-hash/sceneStateHashCameraTypes";
export { DEFAULT_SCENE_STATE_HASH_CLEAR_KEYS } from "../scene-state-hash/sceneStateHashSyncHelpers";

export type UseSceneStateHashSyncOptions = {
  sceneState?: SceneStateSnapshot | null;
  scene?: SceneStateLike | null;
  enabled?: boolean;
  extraHashParams?: Record<string, unknown>;
  clearKeys?: string[];
  replace?: boolean;
  label?: string;
  anchorMode?: SceneStateAnchorMode;
  fallbackHeightM?: number;
  minUpdateIntervalMs?: number;
  altitudeKey?: string;
  defaultFovDeg?: number;
  mapLibreMinPitchDeg?: number;
  mapLibreMaxPitchDeg?: number;
};

const nowMs = (): number => Date.now();

export const useSceneStateHashSync = ({
  sceneState,
  scene,
  enabled = true,
  extraHashParams,
  clearKeys,
  replace = true,
  label = "SceneState:camera",
  anchorMode = "screen-center",
  fallbackHeightM = 200,
  minUpdateIntervalMs = 100,
  altitudeKey = DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY,
  defaultFovDeg,
  mapLibreMinPitchDeg = 0,
  mapLibreMaxPitchDeg = 85,
}: UseSceneStateHashSyncOptions): void => {
  const { updateHash } = useHashState();
  const lastEncodedRef = useRef<string | undefined>(undefined);
  const lastUpdateTsRef = useRef<number>(0);
  const resolvedClearKeys = useMemo(
    () =>
      toUniqueKeys([
        ...readSchemeClearKeys({
          altitudeKey,
        }),
        ...Object.keys(extraHashParams ?? {}),
        ...(clearKeys ?? DEFAULT_SCENE_STATE_HASH_CLEAR_KEYS),
      ]),
    [altitudeKey, clearKeys, extraHashParams]
  );

  const writeCameraHash = useCallback(
    (replaceHash: boolean) => {
      const snapshotFromSceneState = readSceneStateHashSnapshotFromSceneState({
        sceneState,
        anchorMode,
        fallbackHeightM,
      });

      const resolvedCamera = scene?.camera;
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
      if (extraHashParams) {
        Object.assign(params, extraHashParams);
      }

      updateHash(params, {
        clearKeys: resolvedClearKeys,
        label,
        replace: replaceHash,
      });
    },
    [
      anchorMode,
      extraHashParams,
      fallbackHeightM,
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

    const resolvedCamera = scene?.camera;
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
    enabled,
    minUpdateIntervalMs,
    replace,
    scene,
    sceneState,
    writeCameraHash,
  ]);
};
