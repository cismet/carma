import { LngLat } from "maplibre-gl";
import type { CameraOptions, Map as MapLibreMap } from "maplibre-gl";
import { degToRadNumeric, negativePiToPi } from "@carma/units/helpers";
import type { CssPixels, Radians } from "@carma/units/types";
import type { CameraIntrinsics } from "@carma-commons/camera/model";

const CENTER_EPSILON_DEG = 1e-7;
const ZOOM_EPSILON = 1e-6;
const ANGLE_EPSILON_RAD = degToRadNumeric(1e-6)! as Radians;

export type MapLibreViewTarget = Required<
  Pick<CameraOptions, "center" | "zoom" | "bearing" | "pitch">
>;

export const readMapLibreViewOffsetFromCanvas = (
  canvas: HTMLCanvasElement | null | undefined
): CameraIntrinsics["viewOffset"] | undefined => {
  const widthPx = canvas?.clientWidth;
  const heightPx = canvas?.clientHeight;
  if (
    typeof widthPx !== "number" ||
    typeof heightPx !== "number" ||
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    return undefined;
  }

  return {
    fullWidth: widthPx as CssPixels,
    fullHeight: heightPx as CssPixels,
    offsetX: 0 as CssPixels,
    offsetY: 0 as CssPixels,
    width: widthPx as CssPixels,
    height: heightPx as CssPixels,
  };
};

/**
 * Returns `true` when the map's current center / zoom / bearing / pitch
 * are within epsilon of the supplied target values.
 * Bearing and pitch comparison wrap in radians even though MapLibre exposes
 * them in degrees.
 */
export const isMapViewEqualToTarget = (
  map: MapLibreMap,
  target: MapLibreViewTarget
): boolean => {
  const center = map.getCenter();
  const targetCenter = LngLat.convert(target.center);
  const zoom = map.getZoom();
  const bearingRad = degToRadNumeric(map.getBearing()) as Radians | null;
  const pitchRad = degToRadNumeric(map.getPitch()) as Radians | null;
  const targetBearingRad = degToRadNumeric(target.bearing) as Radians | null;
  const targetPitchRad = degToRadNumeric(target.pitch) as Radians | null;

  if (!bearingRad || !pitchRad || !targetBearingRad || !targetPitchRad) {
    return false;
  }

  return (
    Math.abs(center.lng - targetCenter.lng) <= CENTER_EPSILON_DEG &&
    Math.abs(center.lat - targetCenter.lat) <= CENTER_EPSILON_DEG &&
    Math.abs(zoom - target.zoom) <= ZOOM_EPSILON &&
    Math.abs(
      negativePiToPi((bearingRad - targetBearingRad) as Radians) as number
    ) <= ANGLE_EPSILON_RAD &&
    Math.abs(
      negativePiToPi((pitchRad - targetPitchRad) as Radians) as number
    ) <= ANGLE_EPSILON_RAD
  );
};
