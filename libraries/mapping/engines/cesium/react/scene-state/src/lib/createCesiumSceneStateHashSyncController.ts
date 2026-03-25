import type { SceneState } from "./types";

const MIN_SANE_ALTITUDE_M = -10000;
const DEFAULT_MIN_UPDATE_INTERVAL_MS = 100;
const DEFAULT_MIN_ENABLED_DURATION_MS = 350;
const DEFAULT_MIN_STABLE_SAMPLES = 3;

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

export type CesiumSceneStateHashSyncControllerOptions = {
  replace?: boolean;
  minUpdateIntervalMs?: number;
  minEnabledDurationMs?: number;
  minStableSamples?: number;
  nowMs?: () => number;
  readHashParams: (
    sceneState: SceneState | null | undefined
  ) => Record<string, unknown> | null;
  writeCameraHash: (
    params: Record<string, unknown>,
    replaceHash: boolean
  ) => void;
};

export type CesiumSceneStateHashSyncController = {
  reset: () => void;
  onSceneStateChange: (sceneState: SceneState | null | undefined) => void;
  flushPendingHash: (
    sceneState?: SceneState | null | undefined,
    options?: { force?: boolean }
  ) => boolean;
  publishSceneState: (
    sceneState: SceneState | null | undefined,
    options?: { force?: boolean }
  ) => boolean;
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

const isCloseSample = (left: CameraHashSample, right: CameraHashSample) => {
  const closeNumber = (
    a?: number,
    b?: number,
    tolerance = 0.00005
  ): boolean => {
    if (!Number.isFinite(a) && !Number.isFinite(b)) {
      return true;
    }
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return false;
    }

    return Math.abs((a as number) - (b as number)) <= tolerance;
  };

  return (
    closeNumber(left.lat, right.lat, 0.00005) &&
    closeNumber(left.lng, right.lng, 0.00005) &&
    closeNumber(left.zoom, right.zoom, 0.15) &&
    closeNumber(left.altitude, right.altitude, 50) &&
    closeNumber(left.bearing, right.bearing, 5) &&
    closeNumber(left.pitch, right.pitch, 2)
  );
};

const readPoseSample = (
  sceneState: SceneState | null | undefined
): CameraPoseSample | null => {
  if (!sceneState) {
    return null;
  }

  const worldPosition =
    sceneState.camera?.worldPosition ??
    sceneState.camera?.cameraModel?.pose?.position;
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
    ...(Number.isFinite(intrinsics?.fov) ? { fovRad: intrinsics.fov } : {}),
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
  ) => {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return false;
    }

    return Math.abs((left as number) - (right as number)) > toleranceRad;
  };

  const DEG_TO_RAD = Math.PI / 180;
  return (
    hasAngleDelta(previous.bearingRad, current.bearingRad, 0.05 * DEG_TO_RAD) ||
    hasAngleDelta(previous.pitchRad, current.pitchRad, 0.05 * DEG_TO_RAD) ||
    hasAngleDelta(previous.rollRad, current.rollRad, 0.05 * DEG_TO_RAD) ||
    hasAngleDelta(previous.fovRad, current.fovRad, 0.05 * DEG_TO_RAD)
  );
};

export const createCesiumSceneStateHashSyncController = ({
  replace = true,
  minUpdateIntervalMs = DEFAULT_MIN_UPDATE_INTERVAL_MS,
  minEnabledDurationMs = DEFAULT_MIN_ENABLED_DURATION_MS,
  minStableSamples = DEFAULT_MIN_STABLE_SAMPLES,
  nowMs = () => Date.now(),
  readHashParams,
  writeCameraHash,
}: CesiumSceneStateHashSyncControllerOptions): CesiumSceneStateHashSyncController => {
  let lastUpdateTs = 0;
  let enabledAtMs = nowMs();
  let startupSettled = false;
  let stableSampleCount = 0;
  let lastSample: CameraHashSample | null = null;
  let lastPublishedPose: CameraPoseSample | null = null;
  let pendingParams: Record<string, unknown> | null = null;
  let pendingPose: CameraPoseSample | null = null;
  let hasPendingPublish = false;

  const reset = () => {
    lastUpdateTs = 0;
    enabledAtMs = nowMs();
    startupSettled = false;
    stableSampleCount = 0;
    lastSample = null;
    lastPublishedPose = null;
    pendingParams = null;
    pendingPose = null;
    hasPendingPublish = false;
  };

  const onSceneStateChange = (sceneState: SceneState | null | undefined) => {
    if (!sceneState) {
      return;
    }

    const params = readHashParams(sceneState);
    if (!params) {
      return;
    }

    if (!startupSettled) {
      if (nowMs() - enabledAtMs < minEnabledDurationMs) {
        return;
      }

      const currentSample = toCameraHashSample(params);
      if (!currentSample) {
        stableSampleCount = 0;
        lastSample = null;
        return;
      }

      if (!lastSample || !isCloseSample(lastSample, currentSample)) {
        stableSampleCount = 1;
        lastSample = currentSample;
        if (minStableSamples > 1) {
          return;
        }
      } else {
        stableSampleCount += 1;
        lastSample = currentSample;
        if (stableSampleCount < minStableSamples) {
          return;
        }
      }

      startupSettled = true;
    }

    const currentPose = readPoseSample(sceneState);
    if (!hasMeaningfulPoseDelta(lastPublishedPose, currentPose)) {
      return;
    }

    pendingParams = params;
    pendingPose = currentPose;
    hasPendingPublish = true;
  };

  const flushPendingHash = (
    sceneState?: SceneState | null | undefined,
    options?: { force?: boolean }
  ): boolean => {
    if (sceneState) {
      onSceneStateChange(sceneState);
    }

    if (!startupSettled || !hasPendingPublish || !pendingParams) {
      return false;
    }

    const now = nowMs();
    if (!options?.force && now - lastUpdateTs < minUpdateIntervalMs) {
      return false;
    }

    lastUpdateTs = now;
    writeCameraHash(pendingParams, replace);
    lastPublishedPose = pendingPose;
    hasPendingPublish = false;
    return true;
  };

  const publishSceneState = (
    sceneState: SceneState | null | undefined,
    options?: { force?: boolean }
  ): boolean => {
    if (!sceneState) {
      return false;
    }

    const params = readHashParams(sceneState);
    if (!params) {
      return false;
    }

    const now = nowMs();
    if (!options?.force && now - lastUpdateTs < minUpdateIntervalMs) {
      return false;
    }

    lastUpdateTs = now;
    startupSettled = true;
    stableSampleCount = Math.max(stableSampleCount, minStableSamples);
    lastSample = toCameraHashSample(params);
    pendingParams = null;
    pendingPose = null;
    hasPendingPublish = false;
    lastPublishedPose = readPoseSample(sceneState);
    writeCameraHash(params, replace);
    return true;
  };

  return {
    reset,
    onSceneStateChange,
    flushPendingHash,
    publishSceneState,
  };
};
