import type { Map as LeafletMap } from "leaflet";

import {
  CAMERA_TYPE,
  buildOrthographicScale,
} from "@carma-commons/camera/model";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma-geo/utils";
import { isFiniteNumber } from "@carma-commons/math";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import type { Radians } from "@carma-units";

import { buildViewState } from "../core/construct";
import {
  deriveOrbitAngles,
  deriveRoll,
  readMetersPerCssPixelFromViewState,
} from "../core/derivations";
import type { ViewState, ViewStateMetadata } from "../core/types";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ALTITUDE_M = 0;
const DEFAULT_CANONICAL_BEARING_RAD = 0;
const DEFAULT_CANONICAL_PITCH_RAD = 0;
const DEFAULT_CANONICAL_RANGE_M = 1;
const LEAFLET_TILE_SIZE_PX = 256;
const LEAFLET_APPLY_CENTER_EPSILON_DEG = 1e-7;
const LEAFLET_APPLY_ZOOM_EPSILON = 1e-6;

const isLeafletTargetViewEqual = (
  current: { lat: number; lng: number; zoom: number },
  target: { lat: number; lng: number; zoom: number }
): boolean =>
  Math.abs(current.lat - target.lat) <= LEAFLET_APPLY_CENTER_EPSILON_DEG &&
  Math.abs(current.lng - target.lng) <= LEAFLET_APPLY_CENTER_EPSILON_DEG &&
  Math.abs(current.zoom - target.zoom) <= LEAFLET_APPLY_ZOOM_EPSILON;

const deriveLeafletZoom = (
  state: ViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): number => {
  const metersPerPx = readMetersPerCssPixelFromViewState(
    state,
    viewportWidthPx,
    viewportHeightPx
  );
  if (!isFiniteNumber(metersPerPx) || metersPerPx <= 0) {
    return 0;
  }

  const zoom256 = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerPx,
    state.anchorCartographic.latitude,
    { tileSize: LEAFLET_TILE_SIZE_PX }
  );
  return isFiniteNumber(zoom256) ? zoom256 : 0;
};

// ---------------------------------------------------------------------------
// Read: Leaflet map → ViewState
// ---------------------------------------------------------------------------

export const readFromLeaflet = (
  map: LeafletMap,
  sourceId: string,
  seedState: ViewState | null = null
): ViewState | null => {
  let center: {
    lng: number;
    lat: number;
  } | null = null;
  let zoom256: number | null = null;
  let container: HTMLElement | null | undefined = null;

  try {
    center = map.getCenter();
    zoom256 = map.getZoom();
    container = map.getContainer?.();
  } catch {
    return null;
  }

  if (!isFiniteNumber(center.lng) || !isFiniteNumber(center.lat)) return null;

  if (!isFiniteNumber(zoom256)) return null;

  const altitudeM =
    (seedState?.anchorCartographic.altitude as number | undefined) ??
    DEFAULT_ALTITUDE_M;
  const viewportWidthPx =
    typeof container?.clientWidth === "number" &&
    isFiniteNumber(container.clientWidth) &&
    container.clientWidth > 0
      ? container.clientWidth
      : undefined;
  const viewportHeightPx =
    typeof container?.clientHeight === "number" &&
    isFiniteNumber(container.clientHeight) &&
    container.clientHeight > 0
      ? container.clientHeight
      : undefined;

  const latRad = degToRadNumeric(center.lat)! as Radians;

  const metersPerPx = getPixelResolutionFromZoomAtLatitudeRad(zoom256, latRad, {
    tileSize: LEAFLET_TILE_SIZE_PX,
  });
  const orthographicScale = buildOrthographicScale(metersPerPx);

  const metadata: ViewStateMetadata = {
    frameId: 0,
    timestampMs: Date.now(),
    sourceId,
    source: "user-interaction",
    poseEvaluability: {
      bearing: false,
      pitch: false,
      roll: false,
      range: false,
    },
    ...(viewportWidthPx && viewportHeightPx
      ? {
          viewport: {
            widthPx: viewportWidthPx,
            heightPx: viewportHeightPx,
          },
        }
      : {}),
  };

  const preservedOrbit = seedState ? deriveOrbitAngles(seedState) : null;
  const preservedRoll = seedState ? deriveRoll(seedState) : undefined;

  return buildViewState({
    longitude: degToRadNumeric(center.lng)!,
    latitude: latRad as number,
    altitude: altitudeM,
    // Leaflet remains an orthographic source, but when a shared seed state is
    // available we preserve its orbit pose so a 2D controller does not erase
    // the current 3D comparison pose of sibling runtimes.
    bearing: preservedOrbit?.bearing ?? DEFAULT_CANONICAL_BEARING_RAD,
    pitch: preservedOrbit?.pitch ?? DEFAULT_CANONICAL_PITCH_RAD,
    ...(typeof preservedRoll === "number" ? { roll: preservedRoll } : {}),
    range: preservedOrbit?.range ?? DEFAULT_CANONICAL_RANGE_M,
    intrinsics: {
      type: CAMERA_TYPE.ORTHOGRAPHIC,
      ...(orthographicScale ? { orthographicScale } : {}),
    },
    metadata,
  });
};

// ---------------------------------------------------------------------------
// Apply: ViewState → Leaflet map
// ---------------------------------------------------------------------------

export const applyToLeaflet = (map: LeafletMap, state: ViewState): void => {
  const container = map.getContainer?.();
  const zoom256 = deriveLeafletZoom(
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
    !isFiniteNumber(zoom256)
  ) {
    return;
  }

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
