import { isFiniteNumber } from "@carma/math";
import type { Radians } from "@carma/units/types";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import type { CameraIntrinsics } from "@carma-commons/camera/model";
import { readRangeFromMetersPerCssPixel } from "../../adapters/sharedProjection";
import { buildCommonViewState, type AngleBasedViewInput } from "../core/construct";
import { deriveZoom } from "../core/derivations";
import type { CommonViewState, ViewStateMetadata } from "../core/types";

// ---------------------------------------------------------------------------
// Leaflet type surface — only what we actually use
// ---------------------------------------------------------------------------

export type LeafletMapLike = {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  setView(center: [number, number], zoom: number): void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FOV_DEG = 45;
const DEFAULT_ALTITUDE_M = 0;
const LEAFLET_TILE_SIZE_PX = 256;
const MIN_RANGE_M = 0.01;

/** Leaflet uses 256px tiles, our zoom convention is 512px. Offset by 1. */
const zoom256to512 = (z256: number): number => z256 - 1;
const zoom512to256 = (z512: number): number => z512 + 1;

// ---------------------------------------------------------------------------
// Read: Leaflet map → CommonViewState
// ---------------------------------------------------------------------------

export const readFromLeaflet = (
  map: LeafletMapLike,
  sourceId: string,
  options?: { altitudeM?: number; fovDeg?: number }
): CommonViewState | null => {
  const center = map.getCenter();
  if (!isFiniteNumber(center.lng) || !isFiniteNumber(center.lat)) return null;

  const zoom256 = map.getZoom();
  if (!isFiniteNumber(zoom256)) return null;

  const altitudeM = options?.altitudeM ?? DEFAULT_ALTITUDE_M;
  const fovDeg = options?.fovDeg ?? DEFAULT_FOV_DEG;
  const fovRad = degToRadNumeric(fovDeg)!;

  const latRad = degToRadNumeric(center.lat)! as Radians;

  const metersPerPx = getPixelResolutionFromZoomAtLatitudeRad(
    zoom256,
    latRad,
    { tileSize: LEAFLET_TILE_SIZE_PX }
  );
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel: metersPerPx,
    fovRad,
    minRangeM: MIN_RANGE_M,
  });
  if (!isFiniteNumber(rangeM)) return null;

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
    longitude: degToRadNumeric(center.lng)!,
    latitude: latRad as number,
    altitude: altitudeM,
    bearing: 0,
    pitch: 0,
    range: rangeM,
    intrinsics,
    metadata,
  };

  return buildCommonViewState(input);
};

// ---------------------------------------------------------------------------
// Apply: CommonViewState → Leaflet map
// ---------------------------------------------------------------------------

export const applyToLeaflet = (
  map: LeafletMapLike,
  state: CommonViewState
): void => {
  const zoom512 = deriveZoom(state);
  const carto = state.anchorCartographic;

  const latDeg = radToDegNumeric(carto.latitude as number);
  const lngDeg = radToDegNumeric(carto.longitude as number);

  if (!isFiniteNumber(latDeg) || !isFiniteNumber(lngDeg) || !isFiniteNumber(zoom512)) {
    return;
  }

  const zoom256 = zoom512to256(zoom512);
  map.setView([latDeg, lngDeg], zoom256);
};
