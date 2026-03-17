import { isFiniteNumber } from "@carma/math";
import type { SceneStateSnapshot } from "@carma/types";
import type { Radians } from "@carma/units/types";
import { negativePiToPi, radToDegNumeric, zeroToTwoPi } from "./sceneStateHashHelpers";
import type {
  SceneStateHashSnapshot,
} from "./sceneStateHashTypes";

const normalizeBearing = (rad: number): number =>
  zeroToTwoPi(rad as Radians) as number;

const normalizeSigned = (rad: number): number => {
  const normalized = negativePiToPi(rad as Radians) as number;
  return normalized === -Math.PI ? Math.PI : normalized;
};

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

export type SceneStateAnchorMode = "camera-position" | "screen-center";

export const readSceneStateHashSnapshotFromSceneState = ({
  sceneState,
  anchorMode = "screen-center",
  fallbackHeightM = 200,
}: {
  sceneState: SceneStateSnapshot | null | undefined;
  anchorMode?: SceneStateAnchorMode;
  fallbackHeightM?: number;
}): SceneStateHashSnapshot | null => {
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

  const { bearingRad, pitchRad, rollRad, fovVertical } = sceneState.camera;

  const orientation: SceneStateHashSnapshot["orientation"] = {};
  if (isFiniteNumber(bearingRad))
    orientation.bearingRad = normalizeBearing(bearingRad);
  if (isFiniteNumber(pitchRad))
    orientation.pitchRad = normalizeSigned(pitchRad);
  if (isFiniteNumber(rollRad)) orientation.rollRad = normalizeSigned(rollRad);
  if (isFiniteNumber(fovVertical)) orientation.fovVerticalRad = fovVertical;
  if (anchorMode === "screen-center") {
    const rangeM =
      readSceneStateOrbitDistanceM(sceneState) ??
      readFallbackAnchorDistanceM(sceneState, heightM);
    if (isFiniteNumber(rangeM)) orientation.rangeM = rangeM;
  }

  return {
    anchor: {
      lngDeg: radToDegNumeric(anchorCartographic.longitude)!,
      latDeg: radToDegNumeric(anchorCartographic.latitude)!,
      heightM,
    },
    orientation,
  };
};
