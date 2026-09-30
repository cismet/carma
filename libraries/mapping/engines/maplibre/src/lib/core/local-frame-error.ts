import {
  EARTH_RADIUS,
  getPixelResolutionFromZoomAtLatitudeRad,
} from "@carma-geo/proj";
import { degToRad } from "@carma-units";
import type { CssPixels, Degrees, Meters } from "@carma-units";
import { MAPLIBRE_TILE_SIZE } from "../../constants/mercator";

/**
 * Content height the up-vector tilt is charged against. Tall buildings and
 * terrain relief in the served cities stay under it; a taller scene shows the
 * tilt a little earlier than the pixel budget promises.
 */
const LOCAL_FRAME_NOMINAL_HEIGHT_METERS = 200 as Meters;

/**
 * Screen-space error, in CSS pixels, that the current view would show if the
 * scene kept the frame fitted `distance` metres away from its centre.
 *
 * Decision: engines/maplibre/README.md#local-frame-for-ecef-tilesets-sun-and-sky.
 * The frame is a tangent-plane affine at its anchor, so three errors grow with
 * the distance d to it and all are exact at d = 0: the Mercator scale drifts by
 * tan(lat) * d / R and that drift acts across the whole visible half width; the
 * surface sags by d^2 / 2R, visible in proportion to the pitch; and the up
 * vector tilts by d / R, which moves content in proportion to its height. The
 * sum is compared with half a pixel at the current metres per pixel, so a
 * zoomed-in view refits after a few hundred metres and a city overview almost
 * never. Only scalars are touched per frame; vectors move on a refit.
 */
export const localFrameErrorPixels = (
  distance: Meters,
  latitude: Degrees,
  zoom: number,
  pitch: Degrees,
  viewportWidth: CssPixels
): CssPixels => {
  const latitudeRad = degToRad(latitude);
  const metersPerPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad,
    { tileSize: MAPLIBRE_TILE_SIZE }
  );
  const halfViewMeters = (viewportWidth / 2) * metersPerPixel;
  const scaleDrift = (Math.tan(latitudeRad) * distance) / EARTH_RADIUS;
  const scaleErrorMeters = (distance + halfViewMeters) * scaleDrift;
  const sagMeters =
    ((distance * distance) / (2 * EARTH_RADIUS)) * Math.sin(degToRad(pitch));
  const tiltMeters =
    (LOCAL_FRAME_NOMINAL_HEIGHT_METERS * distance) / EARTH_RADIUS;
  return ((scaleErrorMeters + sagMeters + tiltMeters) /
    metersPerPixel) as CssPixels;
};
