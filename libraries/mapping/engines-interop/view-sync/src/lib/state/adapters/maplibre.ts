import { isFiniteNumber, clamp } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  clampLatitudeToWebMercatorExtent,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
} from "@carma/geo/utils";
import type { CameraIntrinsics } from "@carma-commons/camera/model";
import { readRangeFromMetersPerCssPixel } from "../../adapters/sharedProjection";
import { buildCommonViewState, type AngleBasedViewInput } from "../core/construct";
import { deriveOrbitAngles, deriveZoom } from "../core/derivations";
import type { CommonViewState, ViewStateMetadata } from "../core/types";

// ---------------------------------------------------------------------------
// MapLibre type surface — only what we actually use, avoids hard dependency
// ---------------------------------------------------------------------------

export type MapLike = {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  getRoll?: () => number;
  getCanvas?(): HTMLCanvasElement | null;
  jumpTo(options: {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
  }): void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FOV_DEG = 36.87;
const DEFAULT_ALTITUDE_M = 0;
const MAPLIBRE_TILE_SIZE_PX = 512;
const MIN_RANGE_M = 0.01;
const MAX_PITCH_DEG = 85;

// ---------------------------------------------------------------------------
// Read: MapLibre map → CommonViewState
// ---------------------------------------------------------------------------

export const readFromMaplibre = (
  map: MapLike,
  sourceId: string,
  options?: { altitudeM?: number; fovDeg?: number }
): CommonViewState | null => {
  const center = map.getCenter();
  if (!isFiniteNumber(center.lng) || !isFiniteNumber(center.lat)) return null;

  const zoom = map.getZoom();
  if (!isFiniteNumber(zoom)) return null;

  const bearingDeg = map.getBearing();
  const pitchDeg = map.getPitch();
  const altitudeM = options?.altitudeM ?? DEFAULT_ALTITUDE_M;
  const fovDeg = options?.fovDeg ?? DEFAULT_FOV_DEG;
  const fovRad = degToRadNumeric(fovDeg)!;

  const latRad = clampLatitudeToWebMercatorExtent(
    degToRadNumeric(center.lat)! as Radians
  );
  const lonRad = degToRadNumeric(center.lng)! as Radians;

  const metersPerPx = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latRad,
    { tileSize: MAPLIBRE_TILE_SIZE_PX }
  );
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel: metersPerPx,
    fovRad,
    minRangeM: MIN_RANGE_M,
  });
  if (!isFiniteNumber(rangeM)) return null;

  const pitchRad = degToRadNumeric(clamp(pitchDeg, 0, MAX_PITCH_DEG))!;
  const bearingRad = degToRadNumeric(bearingDeg)!;

  const intrinsics: CameraIntrinsics = {
    fov: fovRad as Radians,
  };

  const metadata: ViewStateMetadata = {
    frameId: 0,
    timestampMs: Date.now(),
    sourceId,
    source: "user-interaction",
  };

  const input: AngleBasedViewInput = {
    longitude: lonRad as number,
    latitude: latRad as number,
    altitude: altitudeM,
    bearing: bearingRad,
    pitch: pitchRad,
    range: rangeM,
    intrinsics,
    metadata,
  };

  return buildCommonViewState(input);
};

// ---------------------------------------------------------------------------
// Apply: CommonViewState → MapLibre map
// ---------------------------------------------------------------------------

export const applyToMaplibre = (
  map: MapLike,
  state: CommonViewState
): void => {
  const { bearing, pitch } = deriveOrbitAngles(state);
  const zoom = deriveZoom(state);
  const carto = state.anchorCartographic;

  const lngDeg = radToDegNumeric(carto.longitude as number);
  const latDeg = radToDegNumeric(carto.latitude as number);

  if (!isFiniteNumber(lngDeg) || !isFiniteNumber(latDeg) || !isFiniteNumber(zoom)) {
    return;
  }

  const clampedLatDeg = clamp(
    latDeg,
    -WEB_MERCATOR_MAX_LATITUDE_DEG,
    WEB_MERCATOR_MAX_LATITUDE_DEG
  );

  const bearingDeg = radToDegNumeric(bearing as number);
  const pitchDeg = clamp(radToDegNumeric(pitch as number), 0, MAX_PITCH_DEG);

  map.jumpTo({
    center: [lngDeg, clampedLatDeg],
    zoom,
    bearing: bearingDeg,
    pitch: pitchDeg,
  });
};
