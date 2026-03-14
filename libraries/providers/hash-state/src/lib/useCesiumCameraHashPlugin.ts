import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SceneStateSnapshot } from "@carma/types";
import { useHashState } from "./HashStateProvider";
import {
  DEFAULT_CESIUM_CAMERA_HASH_ALIAS,
  DEFAULT_CESIUM_CAMERA_ALTITUDE_HASH_KEY,
  DEFAULT_CESIUM_CAMERA_HASH_KEY,
  cesiumCameraHashCodec,
  readCesiumCarmaCameraCentricHashParams,
  readCesiumCameraHashSnapshot,
  readCesiumCameraHashSnapshotFromSceneState,
  readCesiumMapLibreCameraCentricHashParams,
  readCesiumMapLibreCompatHashParams,
  type CesiumCameraAnchorMode,
  type CesiumCameraHashEncodeScheme,
  type CesiumCameraLike,
  type CesiumSceneLike,
} from "./cesiumCameraHashCodec";

type CesiumEventLike = {
  addEventListener: (listener: () => void) => void;
  removeEventListener: (listener: () => void) => void;
};

export const DEFAULT_CESIUM_CAMERA_CLEAR_KEYS = [
  "lat",
  "lng",
  "zoom",
  "altitude",
  "range",
  "bearing",
  "pitch",
  "h",
  "heading",
  "roll",
  "fov",
  "camera3d",
  "c3",
] as const;

export type UseCesiumCameraHashPluginOptions = {
  sceneState?: SceneStateSnapshot | null;
  scene?: CesiumSceneLike | null;
  camera?: CesiumCameraLike | null;
  enabled?: boolean;
  hashKey?: string;
  hashAlias?: string;
  encodeScheme?: CesiumCameraHashEncodeScheme;
  includeIsCesiumFlag?: boolean;
  isCesiumFlagKey?: string;
  isCesiumFlagValue?: number | string;
  clearKeys?: string[];
  replace?: boolean;
  label?: string;
  anchorMode?: CesiumCameraAnchorMode;
  fallbackHeightM?: number;
  minUpdateIntervalMs?: number;
  altitudeKey?: string;
  rangeKey?: string;
  mapLibreMinPitchDeg?: number;
  mapLibreMaxPitchDeg?: number;
};

const nowMs = (): number => Date.now();

const resolveCesiumCameraEvent = (
  scene: CesiumSceneLike | null | undefined,
  camera: CesiumCameraLike
): CesiumEventLike | null => {
  const cameraMoveEnd = (camera as { moveEnd?: CesiumEventLike }).moveEnd;
  if (
    cameraMoveEnd &&
    typeof cameraMoveEnd.addEventListener === "function" &&
    typeof cameraMoveEnd.removeEventListener === "function"
  ) {
    return cameraMoveEnd;
  }

  const cameraChanged = (camera as { changed?: CesiumEventLike }).changed;
  if (
    cameraChanged &&
    typeof cameraChanged.addEventListener === "function" &&
    typeof cameraChanged.removeEventListener === "function"
  ) {
    return cameraChanged;
  }

  const scenePostRender = scene
    ? (scene as { postRender?: CesiumEventLike }).postRender
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
  rangeKey,
}: {
  encodeScheme: CesiumCameraHashEncodeScheme;
  hashKey: string;
  hashAlias: string;
  altitudeKey: string;
  rangeKey: string;
}): string[] => {
  if (encodeScheme === "carma-camera-centric") {
    return toUniqueKeys([
      hashKey,
      hashAlias,
      altitudeKey,
      rangeKey,
      "zoom",
      "bearing",
    ]);
  }

  if (encodeScheme === "maplibre-object-centric") {
    return toUniqueKeys([
      hashKey,
      hashAlias,
      altitudeKey,
      rangeKey,
      "h",
      "heading",
      "roll",
      "fov",
    ]);
  }

  if (encodeScheme === "maplibre-camera-centric") {
    return toUniqueKeys([
      hashKey,
      hashAlias,
      altitudeKey,
      rangeKey,
      "h",
      "heading",
      "roll",
      "fov",
    ]);
  }

  return toUniqueKeys([
    hashKey,
    hashAlias,
    "lat",
    "lng",
    "zoom",
    altitudeKey,
    rangeKey,
    "bearing",
    "pitch",
    "h",
    "heading",
    "roll",
    "fov",
  ]);
};

export const useCesiumCameraHashPlugin = ({
  sceneState,
  scene,
  camera,
  enabled = true,
  hashKey = DEFAULT_CESIUM_CAMERA_HASH_KEY,
  hashAlias = DEFAULT_CESIUM_CAMERA_HASH_ALIAS,
  encodeScheme = "carma-object-centric",
  includeIsCesiumFlag = true,
  isCesiumFlagKey = "isCesium",
  isCesiumFlagValue = 1,
  clearKeys,
  replace = true,
  label = "Cesium:camera",
  anchorMode = "screen-center",
  fallbackHeightM = 200,
  minUpdateIntervalMs = 100,
  altitudeKey = DEFAULT_CESIUM_CAMERA_ALTITUDE_HASH_KEY,
  rangeKey = "range",
  mapLibreMinPitchDeg = 0,
  mapLibreMaxPitchDeg = 85,
}: UseCesiumCameraHashPluginOptions): void => {
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
          rangeKey,
        }),
        ...(clearKeys ?? DEFAULT_CESIUM_CAMERA_CLEAR_KEYS),
      ]),
    [altitudeKey, clearKeys, encodeScheme, hashAlias, hashKey, rangeKey]
  );

  const writeCameraHash = useCallback(
    (replaceHash: boolean) => {
      const snapshotFromSceneState = readCesiumCameraHashSnapshotFromSceneState(
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
          ? readCesiumCameraHashSnapshot({
              camera: resolvedCamera,
              scene,
              anchorMode,
              fallbackHeightM,
            })
          : null);
      if (!snapshot) {
        return;
      }

      const encoded = cesiumCameraHashCodec.encode(snapshot);
      if (!encoded) {
        return;
      }
      if (encoded === lastEncodedRef.current) {
        return;
      }
      lastEncodedRef.current = encoded;

      const params: Record<string, unknown> = {};
      if (encodeScheme === "carma-camera-centric") {
        Object.assign(
          params,
          readCesiumCarmaCameraCentricHashParams({
            snapshot,
            sceneState,
            camera: resolvedCamera,
            fallbackHeightM,
          })
        );
      } else if (encodeScheme === "maplibre-object-centric") {
        Object.assign(
          params,
          readCesiumMapLibreCompatHashParams({
            snapshot,
            sceneState,
            scene,
            camera: resolvedCamera,
            includeAltitude: false,
            minPitchDeg: mapLibreMinPitchDeg,
            maxPitchDeg: mapLibreMaxPitchDeg,
          })
        );
      } else if (encodeScheme === "maplibre-camera-centric") {
        Object.assign(
          params,
          readCesiumMapLibreCameraCentricHashParams({
            snapshot,
            sceneState,
            scene,
            camera: resolvedCamera,
            includeAltitude: false,
            fallbackHeightM,
            minPitchDeg: mapLibreMinPitchDeg,
            maxPitchDeg: mapLibreMaxPitchDeg,
          })
        );
      } else {
        params[hashKey] = snapshot;
      }
      if (includeIsCesiumFlag) {
        params[isCesiumFlagKey] = isCesiumFlagValue;
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
      includeIsCesiumFlag,
      isCesiumFlagKey,
      isCesiumFlagValue,
      label,
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

    const event = resolveCesiumCameraEvent(scene, resolvedCamera);
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
