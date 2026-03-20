import { useCallback, useEffect, useMemo, useRef } from "react";
import { HASH_CLEAR_KEY_SET, useHashState } from "@carma-providers/hash-state";
import {
  HASH_FOV_CONVENTION,
  type HashFovConvention,
  type HashZoomConvention,
  readHashParamsFromViewState,
  readViewStateFromSceneState,
} from "@carma-mapping/engines-interop/view-sync";

import { useCesiumSceneStateOptional } from "./useCesiumSceneState";
import type { SceneLike } from "./types";

const toUniqueKeys = (keys: readonly string[]): string[] =>
  Array.from(new Set(keys.filter((key) => key.length > 0)));

const nowMs = (): number => Date.now();
const MIN_SANE_ALTITUDE_M = -10000;

type CameraHashSample = {
  lat: number;
  lng: number;
  zoom?: number;
  altitude?: number;
  bearing?: number;
  pitch?: number;
};

type CameraPoseSample = {
  worldX: number;
  worldY: number;
  worldZ: number;
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  fovRad?: number;
};

const readFinite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const toCameraHashSample = (
  params: Record<string, unknown>
): CameraHashSample | null => {
  const lat = readFinite(params.lat);
  const lng = readFinite(params.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const altitude = readFinite(params.altitude);
  if (Number.isFinite(altitude) && altitude < MIN_SANE_ALTITUDE_M) {
    return null;
  }

  return {
    lat,
    lng,
    ...(Number.isFinite(readFinite(params.zoom))
      ? { zoom: readFinite(params.zoom) }
      : {}),
    ...(Number.isFinite(altitude) ? { altitude } : {}),
    ...(Number.isFinite(readFinite(params.bearing))
      ? { bearing: readFinite(params.bearing) }
      : {}),
    ...(Number.isFinite(readFinite(params.pitch))
      ? { pitch: readFinite(params.pitch) }
      : {}),
  };
};

const isCloseSample = (a: CameraHashSample, b: CameraHashSample): boolean => {
  const closeNumber = (left?: number, right?: number, tolerance = 0.00005) => {
    if (!Number.isFinite(left) && !Number.isFinite(right)) {
      return true;
    }
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return false;
    }
    return Math.abs((left as number) - (right as number)) <= tolerance;
  };

  return (
    closeNumber(a.lat, b.lat, 0.00005) &&
    closeNumber(a.lng, b.lng, 0.00005) &&
    closeNumber(a.zoom, b.zoom, 0.15) &&
    closeNumber(a.altitude, b.altitude, 50) &&
    closeNumber(a.bearing, b.bearing, 5) &&
    closeNumber(a.pitch, b.pitch, 2)
  );
};

const readPoseSample = (
  sceneState: NonNullable<ReturnType<typeof useCesiumSceneStateOptional>>
): CameraPoseSample | null => {
  const worldPosition =
    sceneState.camera?.worldPosition ?? sceneState.camera?.cameraModel?.pose?.position;
  if (
    !worldPosition ||
    !Number.isFinite(worldPosition.x) ||
    !Number.isFinite(worldPosition.y) ||
    !Number.isFinite(worldPosition.z)
  ) {
    return null;
  }

  const intrinsics = sceneState.camera?.cameraModel?.intrinsics;
  return {
    worldX: worldPosition.x,
    worldY: worldPosition.y,
    worldZ: worldPosition.z,
    ...(Number.isFinite(sceneState.camera?.bearingRad)
      ? { bearingRad: sceneState.camera?.bearingRad }
      : {}),
    ...(Number.isFinite(sceneState.camera?.pitchRad)
      ? { pitchRad: sceneState.camera?.pitchRad }
      : {}),
    ...(Number.isFinite(sceneState.camera?.rollRad)
      ? { rollRad: sceneState.camera?.rollRad }
      : {}),
    ...(Number.isFinite(intrinsics?.fov) ? { fovRad: intrinsics?.fov } : {}),
  };
};

const hasMeaningfulPoseDelta = (
  previous: CameraPoseSample | null,
  current: CameraPoseSample | null
): boolean => {
  if (!previous || !current) {
    return true;
  }

  const positionDeltaM = Math.hypot(
    current.worldX - previous.worldX,
    current.worldY - previous.worldY,
    current.worldZ - previous.worldZ
  );
  if (positionDeltaM > 0.5) {
    return true;
  }

  const hasAngleDelta = (
    left: number | undefined,
    right: number | undefined,
    toleranceRad: number
  ): boolean => {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return false;
    }
    return Math.abs((left as number) - (right as number)) > toleranceRad;
  };

  const DEG_TO_RAD = Math.PI / 180;
  if (
    hasAngleDelta(previous.bearingRad, current.bearingRad, 0.05 * DEG_TO_RAD) ||
    hasAngleDelta(previous.pitchRad, current.pitchRad, 0.05 * DEG_TO_RAD) ||
    hasAngleDelta(previous.rollRad, current.rollRad, 0.05 * DEG_TO_RAD) ||
    hasAngleDelta(previous.fovRad, current.fovRad, 0.05 * DEG_TO_RAD)
  ) {
    return true;
  }

  return false;
};

export type CesiumSceneStateHashSyncProps = {
  enabled?: boolean;
  scene?: SceneLike | null;
  extraHashParams?: Record<string, unknown>;
  clearKeys?: string[];
  replace?: boolean;
  label?: string;
  fallbackHeightM?: number;
  minUpdateIntervalMs?: number;
  defaultFovDeg?: number;
  maxPitchDeg?: number;
  zoomConvention?: HashZoomConvention;
  fovConvention?: HashFovConvention;
  minEnabledDurationMs?: number;
  minStableSamples?: number;
};

export const CesiumSceneStateHashSync = ({
  enabled = true,
  scene = null,
  extraHashParams,
  clearKeys,
  replace = true,
  label = "SceneState:camera",
  fallbackHeightM = 200,
  minUpdateIntervalMs = 100,
  defaultFovDeg,
  maxPitchDeg,
  zoomConvention,
  fovConvention = HASH_FOV_CONVENTION.CESIUM_LONGER_EDGE,
  minEnabledDurationMs = 350,
  minStableSamples = 3,
}: CesiumSceneStateHashSyncProps) => {
  const sceneState = useCesiumSceneStateOptional();
  const { updateHash } = useHashState();
  const lastUpdateTsRef = useRef<number>(0);
  const enabledAtMsRef = useRef<number | null>(null);
  const startupSettledRef = useRef<boolean>(false);
  const stableSampleCountRef = useRef<number>(0);
  const lastSampleRef = useRef<CameraHashSample | null>(null);
  const lastPublishedPoseRef = useRef<CameraPoseSample | null>(null);

  useEffect(() => {
    if (!enabled) {
      enabledAtMsRef.current = null;
      startupSettledRef.current = false;
      stableSampleCountRef.current = 0;
      lastSampleRef.current = null;
      lastPublishedPoseRef.current = null;
      return;
    }

    if (enabledAtMsRef.current === null) {
      enabledAtMsRef.current = nowMs();
      startupSettledRef.current = false;
      stableSampleCountRef.current = 0;
      lastSampleRef.current = null;
      lastPublishedPoseRef.current = null;
    }
  }, [enabled]);

  const resolvedClearKeys = useMemo(
    () =>
      toUniqueKeys([
        ...Object.keys(extraHashParams ?? {}),
        ...(clearKeys ?? []),
      ]),
    [clearKeys, extraHashParams]
  );

  const writeCameraHash = useCallback(
    (params: Record<string, unknown>, replaceHash: boolean) => {
      updateHash(params, {
        clearKeySetIds: [HASH_CLEAR_KEY_SET.SCENE_VIEW_STATE],
        clearKeys: resolvedClearKeys,
        label,
        replace: replaceHash,
      });
    },
    [label, resolvedClearKeys, updateHash]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!sceneState) {
      return;
    }

    const viewStateFromSceneState = readViewStateFromSceneState(
      sceneState as unknown as Parameters<
        typeof readViewStateFromSceneState
      >[0],
      scene as unknown as Parameters<typeof readViewStateFromSceneState>[1]
    );
    if (!viewStateFromSceneState) {
      return;
    }

    const params: Record<string, unknown> = {
      ...(readHashParamsFromViewState(viewStateFromSceneState, {
        ...(Number.isFinite(defaultFovDeg) ? { defaultFovDeg } : {}),
        ...(Number.isFinite(maxPitchDeg) ? { maxPitchDeg } : {}),
        ...(zoomConvention ? { zoomConvention } : {}),
        ...(fovConvention ? { fovConvention } : {}),
      }) ?? {}),
      ...(extraHashParams ?? {}),
    };

    if (!startupSettledRef.current) {
      const enabledAt = enabledAtMsRef.current;
      if (
        !Number.isFinite(enabledAt) ||
        nowMs() - (enabledAt as number) < minEnabledDurationMs
      ) {
        return;
      }

      const currentSample = toCameraHashSample(params);
      if (!currentSample) {
        stableSampleCountRef.current = 0;
        lastSampleRef.current = null;
        return;
      }

      const previousSample = lastSampleRef.current;
      if (!previousSample || !isCloseSample(previousSample, currentSample)) {
        stableSampleCountRef.current = 1;
        lastSampleRef.current = currentSample;
        return;
      }

      stableSampleCountRef.current += 1;
      lastSampleRef.current = currentSample;
      if (stableSampleCountRef.current < minStableSamples) {
        return;
      }

      startupSettledRef.current = true;
    }

    const currentPoseSample = readPoseSample(sceneState);
    if (
      !hasMeaningfulPoseDelta(lastPublishedPoseRef.current, currentPoseSample)
    ) {
      return;
    }

    const now = nowMs();
    if (now - lastUpdateTsRef.current < minUpdateIntervalMs) {
      return;
    }
    lastUpdateTsRef.current = now;
    writeCameraHash(params, replace);
    lastPublishedPoseRef.current = currentPoseSample;
  }, [
    defaultFovDeg,
    enabled,
    extraHashParams,
    fovConvention,
    maxPitchDeg,
    minEnabledDurationMs,
    minStableSamples,
    minUpdateIntervalMs,
    replace,
    scene,
    sceneState,
    writeCameraHash,
    zoomConvention,
  ]);

  return null;
};
