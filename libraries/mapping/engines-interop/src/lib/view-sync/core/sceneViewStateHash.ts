import { isFiniteNumber, isZeroish } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { SceneViewState } from "./sceneViewState";

export const readSceneViewStateHashNumber = (
  value: unknown
): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return isFiniteNumber(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const readHashParamsFromSceneViewState = (
  viewState: SceneViewState | null | undefined
): Record<string, number> | null => {
  if (!viewState) {
    return null;
  }

  const params: Record<string, number> = {
    lng: viewState.anchor.lngDeg,
    lat: viewState.anchor.latDeg,
    altitude: viewState.anchor.heightM,
  };

  const bearingDeg = isFiniteNumber(viewState.orientation.bearingRad)
    ? radToDegNumeric(viewState.orientation.bearingRad)!
    : undefined;
  if (!isZeroish(bearingDeg)) {
    params.bearing = bearingDeg!;
  }

  const pitchDeg = isFiniteNumber(viewState.orientation.pitchRad)
    ? radToDegNumeric(viewState.orientation.pitchRad)!
    : undefined;
  if (!isZeroish(pitchDeg)) {
    params.pitch = pitchDeg!;
  }

  const fovDeg = isFiniteNumber(viewState.orientation.fovVerticalRad)
    ? radToDegNumeric(viewState.orientation.fovVerticalRad)!
    : undefined;
  if (isFiniteNumber(fovDeg)) {
    params.fov = fovDeg;
  }

  if (isFiniteNumber(viewState.orientation.rangeM)) {
    params.range = viewState.orientation.rangeM;
  }

  return params;
};

export const readSceneViewStateFromHashValues = (
  hashValues: Record<string, unknown>
): SceneViewState | null => {
  const lngDeg = readSceneViewStateHashNumber(hashValues.lng);
  const latDeg = readSceneViewStateHashNumber(hashValues.lat);
  const heightM = readSceneViewStateHashNumber(hashValues.altitude);

  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(heightM)
  ) {
    return null;
  }

  const bearingDeg = readSceneViewStateHashNumber(hashValues.bearing);
  const pitchDeg = readSceneViewStateHashNumber(hashValues.pitch);
  const fovDeg = readSceneViewStateHashNumber(hashValues.fov);
  const range = readSceneViewStateHashNumber(hashValues.range);

  return {
    anchor: {
      lngDeg,
      latDeg,
      heightM,
    },
    orientation: {
      ...(isFiniteNumber(bearingDeg)
        ? { bearingRad: degToRadNumeric(bearingDeg)! }
        : {}),
      ...(isFiniteNumber(pitchDeg)
        ? { pitchRad: degToRadNumeric(pitchDeg)! }
        : {}),
      ...(isFiniteNumber(fovDeg)
        ? { fovVerticalRad: degToRadNumeric(fovDeg)! }
        : {}),
      ...(isFiniteNumber(range) ? { rangeM: range } : {}),
    },
  };
};
