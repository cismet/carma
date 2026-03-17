import { isFiniteNumber } from "@carma/math";
import { readSceneStateFromMapLibrePlusElevationHashValues } from "./sceneStateHashMapLibreAdapter";
import type { SceneStateHashSnapshot } from "./sceneStateHashTypes";

export const readInitialSceneStateHashSnapshotFromHashValues = (
  hashValues: Record<string, unknown>,
  defaultFovDeg?: number,
  defaultZoom?: number,
  viewportWidthPx: number = 1920,
  viewportHeightPx: number = 1080
): SceneStateHashSnapshot | null => {
  const lngDeg = hashValues.lng;
  const latDeg = hashValues.lat;
  const heightM = hashValues.altitude;
  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(heightM)
  ) {
    return null;
  }

  const bearingDeg = hashValues.bearing;
  const pitchDeg = hashValues.pitch;
  const zoom = hashValues.zoom;
  const fovDeg = hashValues.fov;

  return readSceneStateFromMapLibrePlusElevationHashValues({
    values: {
      lng: lngDeg,
      lat: latDeg,
      zoom: isFiniteNumber(zoom)
        ? zoom
        : isFiniteNumber(defaultZoom)
        ? defaultZoom
        : undefined,
      altitude: heightM,
      bearing: isFiniteNumber(bearingDeg) ? bearingDeg : undefined,
      pitch: isFiniteNumber(pitchDeg) ? pitchDeg : undefined,
      fov: isFiniteNumber(fovDeg) ? fovDeg : undefined,
    },
    viewportWidthPx,
    viewportHeightPx,
    options: isFiniteNumber(defaultFovDeg)
      ? { defaultFovDeg }
      : undefined,
  });
};