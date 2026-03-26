import { isFiniteNumber } from "@carma/math";
import type { Radians } from "@carma/units/types";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import type { Map as LeafletMap } from "leaflet";
import {
  readRangeFromMetersPerCssPixel,
  readViewOffsetFromElement,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import { buildViewState, type AngleBasedViewInput } from "../core/construct";
import { deriveOrbitAngles, deriveRoll, deriveZoom } from "../core/derivations";
import type { ViewState, ViewStateMetadata } from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FOV_DEG = 45;
const DEFAULT_ALTITUDE_M = 0;
const LEAFLET_TILE_SIZE_PX = 256;
const MIN_RANGE_M = 0.01;
const LEAFLET_APPLY_CENTER_EPSILON_DEG = 1e-7;
const LEAFLET_APPLY_ZOOM_EPSILON = 1e-6;

/** Leaflet uses 256px tiles, our zoom convention is 512px. Offset by 1. */
const zoom256to512 = (z256: number): number => z256 - 1;
const zoom512to256 = (z512: number): number => z512 + 1;

const isLeafletTargetViewEqual = (
  current: { lat: number; lng: number; zoom: number },
  target: { lat: number; lng: number; zoom: number }
): boolean =>
  Math.abs(current.lat - target.lat) <= LEAFLET_APPLY_CENTER_EPSILON_DEG &&
  Math.abs(current.lng - target.lng) <= LEAFLET_APPLY_CENTER_EPSILON_DEG &&
  Math.abs(current.zoom - target.zoom) <= LEAFLET_APPLY_ZOOM_EPSILON;

// ---------------------------------------------------------------------------
// Read: Leaflet map → ViewState
// ---------------------------------------------------------------------------

export const readFromLeaflet = (
  map: LeafletMap,
  sourceId: string,
  options?: {
    altitudeM?: number;
    fovDeg?: number;
    seedState?: ViewState | null;
  }
): ViewState | null => {
  const center = map.getCenter();
  if (!isFiniteNumber(center.lng) || !isFiniteNumber(center.lat)) return null;

  const zoom256 = map.getZoom();
  if (!isFiniteNumber(zoom256)) return null;

  const seedState = options?.seedState ?? null;
  const seedOrbit = seedState ? deriveOrbitAngles(seedState) : null;
  const seedRoll = seedState ? deriveRoll(seedState) : null;
  const altitudeM =
    options?.altitudeM ??
    (seedState?.anchorCartographic.altitude as number | undefined) ??
    DEFAULT_ALTITUDE_M;
  const fovRad =
    seedState?.intrinsics.fov ??
    degToRadNumeric(options?.fovDeg ?? DEFAULT_FOV_DEG)!;
  const viewOffset = readViewOffsetFromElement(map.getContainer?.());

  const latRad = degToRadNumeric(center.lat)! as Radians;

  const metersPerPx = getPixelResolutionFromZoomAtLatitudeRad(zoom256, latRad, {
    tileSize: LEAFLET_TILE_SIZE_PX,
  });
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel: metersPerPx,
    fovRad,
    minRangeM: MIN_RANGE_M,
    viewportWidthPx: viewOffset?.width as number | undefined,
    viewportHeightPx: viewOffset?.height as number | undefined,
  });
  if (!isFiniteNumber(rangeM)) return null;

  const intrinsics: CameraIntrinsics = seedState
    ? {
        ...seedState.intrinsics,
        fov: fovRad as Radians,
        ...(viewOffset ? { viewOffset } : {}),
      }
    : {
        fov: fovRad as Radians,
        ...(viewOffset ? { viewOffset } : {}),
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
    bearing: seedOrbit?.bearing ?? 0,
    pitch: seedOrbit?.pitch ?? 0,
    ...(seedRoll ? { roll: seedRoll } : {}),
    range: rangeM,
    intrinsics,
    metadata,
  };

  return buildViewState(input);
};

// ---------------------------------------------------------------------------
// Apply: ViewState → Leaflet map
// ---------------------------------------------------------------------------

export const applyToLeaflet = (map: LeafletMap, state: ViewState): void => {
  const container = map.getContainer?.();
  const zoom512 = deriveZoom(
    state,
    container?.clientWidth,
    container?.clientHeight
  );
  const carto = state.anchorCartographic;

  const latDeg = radToDegNumeric(carto.latitude as number);
  const lngDeg = radToDegNumeric(carto.longitude as number);

  if (
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(zoom512)
  ) {
    return;
  }

  const zoom256 = zoom512to256(zoom512);
  let currentView: { lat: number; lng: number; zoom: number } | null = null;
  try {
    const center = map.getCenter();
    const zoom = map.getZoom();
    if (
      isFiniteNumber(center.lat) &&
      isFiniteNumber(center.lng) &&
      isFiniteNumber(zoom)
    ) {
      currentView = { lat: center.lat, lng: center.lng, zoom };
    }
  } catch {
    currentView = null;
  }

  if (
    currentView &&
    isLeafletTargetViewEqual(currentView, {
      lat: latDeg,
      lng: lngDeg,
      zoom: zoom256,
    })
  ) {
    return;
  }

  map.setView([latDeg, lngDeg], zoom256, { animate: false });
};
