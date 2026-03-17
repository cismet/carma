import type { OrbitPointSource, SceneStateSnapshot } from "@carma/types";
import type {
  SceneDescriptorAnchorSource,
  SceneDescriptorHashSnapshot,
} from "./sceneStateHashCodec";

const RAD_TO_DEG = 180 / Math.PI;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeBearingDeg = (bearingDeg: number): number => {
  const normalized = bearingDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const normalizeSignedDeg = (angleDeg: number): number => {
  const normalized = ((((angleDeg + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
};

const toDeg = (radians: number): number => radians * RAD_TO_DEG;

const readSceneStateOrbitDistanceM = (
  sceneState: SceneStateSnapshot
): number | undefined => {
  const cameraPosition = sceneState.camera.worldPosition;
  const orbitPosition = sceneState.orbitPoint?.worldPosition;
  if (!orbitPosition) {
    return undefined;
  }

  const dx = cameraPosition.x - orbitPosition.x;
  const dy = cameraPosition.y - orbitPosition.y;
  const dz = cameraPosition.z - orbitPosition.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!isFiniteNumber(distance)) {
    return undefined;
  }

  return Math.max(distance, 0.01);
};

const readFallbackAnchorDistanceM = (
  sceneState: SceneStateSnapshot,
  anchorHeightM: number
): number | undefined => {
  const cameraHeightM = sceneState.camera.cartographic?.altitude;
  if (!isFiniteNumber(cameraHeightM)) {
    return undefined;
  }

  const distance = Math.abs(cameraHeightM - anchorHeightM);
  if (!isFiniteNumber(distance)) {
    return undefined;
  }

  return Math.max(distance, 0.01);
};

export type SceneDescriptorAnchorMode = "camera-position" | "screen-center";

const toAnchorSourceFromOrbitPointSource = (
  source: OrbitPointSource
): SceneDescriptorAnchorSource => {
  if (source === "screen-center-depth" || source === "screen-center-globe") {
    return "screen-center";
  }
  if (source === "fallback") {
    return "fallback";
  }
  return "camera-position";
};

export const readSceneDescriptorHashSnapshotFromSceneState = ({
  sceneState,
  anchorMode = "screen-center",
  fallbackHeightM = 200,
}: {
  sceneState: SceneStateSnapshot | null | undefined;
  anchorMode?: SceneDescriptorAnchorMode;
  fallbackHeightM?: number;
}): SceneDescriptorHashSnapshot | null => {
  if (!sceneState) {
    return null;
  }

  const cameraCartographic = sceneState.camera.cartographic;
  const orbitPoint = sceneState.orbitPoint;
  const orbitCartographic = orbitPoint?.cartographic ?? null;

  const anchorCartographic =
    anchorMode === "screen-center"
      ? orbitCartographic ?? cameraCartographic
      : cameraCartographic;
  if (!anchorCartographic) {
    return null;
  }

  const heightM = Number.isFinite(anchorCartographic.altitude)
    ? anchorCartographic.altitude
    : fallbackHeightM;
  const source: SceneDescriptorAnchorSource =
    anchorMode === "screen-center"
      ? orbitPoint
        ? toAnchorSourceFromOrbitPointSource(orbitPoint.source)
        : "fallback"
      : "camera-position";

  const bearingDeg = isFiniteNumber(sceneState.camera.bearingRad)
    ? normalizeBearingDeg(toDeg(sceneState.camera.bearingRad))
    : undefined;
  const pitchDeg = isFiniteNumber(sceneState.camera.pitchRad)
    ? normalizeSignedDeg(toDeg(sceneState.camera.pitchRad))
    : undefined;
  const rollDeg = isFiniteNumber(sceneState.camera.rollRad)
    ? normalizeSignedDeg(toDeg(sceneState.camera.rollRad))
    : undefined;
  const fovDeg = isFiniteNumber(sceneState.camera.fovVertical)
    ? toDeg(sceneState.camera.fovVertical)
    : undefined;
  const rangeM =
    anchorMode === "screen-center"
      ? readSceneStateOrbitDistanceM(sceneState) ??
        readFallbackAnchorDistanceM(sceneState, heightM)
      : undefined;

  return {
    anchor: {
      lngDeg: toDeg(anchorCartographic.longitude),
      latDeg: toDeg(anchorCartographic.latitude),
      heightM,
      source,
    },
    orientation: {
      ...(isFiniteNumber(bearingDeg) ? { bearingDeg } : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchDeg } : {}),
      ...(isFiniteNumber(rollDeg) ? { rollDeg } : {}),
      ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      ...(isFiniteNumber(rangeM) ? { rangeM } : {}),
    },
  };
};
