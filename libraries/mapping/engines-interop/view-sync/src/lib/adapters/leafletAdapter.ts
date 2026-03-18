import type { Map as LeafletMap } from "leaflet";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";
import { isFiniteNumber } from "@carma/math";
import { degToRadNumeric, radToDegNumeric, zeroToTwoPi } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import type { ViewState } from "../core/types";
import {
  DEFAULT_FOV_DEG,
  type LeafletViewValues,
} from "./types";
import {
  normalizeBearingRadToDeg,
  readMetersPerCssPixel,
  readRangeFromMetersPerCssPixel,
} from "./sharedProjection";

const DEFAULT_LEAFLET_FOV_VERTICAL_RAD = degToRadNumeric(DEFAULT_FOV_DEG)!;
const LEAFLET_TILE_SIZE_PX = 256;
const LEAFLET_PROJECTION_MIN_RANGE_M = 0.01;

const zoom512as256 = (zoom512: number): number => zoom512 + 1;
const zoom256as512 = (zoom256: number): number => zoom256 - 1;

export type ViewSyncLeafletProjection = {
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  bearingDeg?: number;
};

export const projectViewSyncTargetToLeaflet = (
  target: ViewState,
  options: {
    fovVertical?: number;
    tileSizePx?: number;
    includeBearing?: boolean;
  } = {}
): ViewSyncLeafletProjection | null => {
  const {
    fovVertical,
    tileSizePx = LEAFLET_TILE_SIZE_PX,
    includeBearing = false,
  } = options;
  const storedZoom = isFiniteNumber(target.zoom) ? target.zoom : undefined;
  if (isFiniteNumber(storedZoom)) {
    return {
      center: {
        lat: radToDegNumeric(target.latitude),
        lng: radToDegNumeric(target.longitude),
      },
      zoom: zoom512as256(storedZoom),
      ...(includeBearing
        ? {
            bearingDeg: normalizeBearingRadToDeg(target.bearing),
          }
        : {}),
    };
  }

  const resolvedFovVertical = fovVertical ?? target.fovVertical;
  if (!isFiniteNumber(resolvedFovVertical)) {
    return null;
  }

  const metersPerCssPixel = readMetersPerCssPixel({
    rangeM: target.range,
    fovRad: resolvedFovVertical,
  });
  if (!isFiniteNumber(metersPerCssPixel)) {
    return null;
  }

  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCssPixel as Meters,
    target.latitude,
    { tileSize: tileSizePx }
  );
  if (!isFiniteNumber(zoom)) {
    return null;
  }

  return {
    center: {
      lat: radToDegNumeric(target.latitude),
      lng: radToDegNumeric(target.longitude),
    },
    zoom,
    ...(includeBearing
      ? {
          bearingDeg: normalizeBearingRadToDeg(target.bearing),
        }
      : {}),
  };
};

export const projectLeafletViewToViewSyncTarget = (
  lngDeg: number,
  latDeg: number,
  zoom: number,
  anchorAltitudeM: number,
  fovVertical: number,
  options: {
    bearingDeg?: number;
    tileSizePx?: number;
  } = {}
): ViewState | null => {
  const { bearingDeg = 0, tileSizePx = LEAFLET_TILE_SIZE_PX } = options;
  const latitudeRad = degToRadNumeric(latDeg) as Radians;
  const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad,
    { tileSize: tileSizePx }
  );
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel,
    fovRad: fovVertical,
    minRangeM: LEAFLET_PROJECTION_MIN_RANGE_M,
  });

  if (
    !isFiniteNumber(rangeM) ||
    !isFiniteNumber(anchorAltitudeM) ||
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg)
  ) {
    return null;
  }

  return {
    longitude: degToRadNumeric(lngDeg) as Radians,
    latitude: latitudeRad,
    altitude: anchorAltitudeM as Meters,
    zoom: zoom256as512(zoom),
    bearing: zeroToTwoPi(degToRadNumeric(bearingDeg)! as Radians) as Radians,
    pitch: 0 as Radians,
    range: rangeM as Meters,
    ...(isFiniteNumber(fovVertical)
      ? {
          fovVertical: fovVertical as Radians,
        }
      : {}),
  };
};

const toCarmaViewState = (
  values: LeafletViewValues,
  fallbackAltitudeM: number = 200
): ViewState | null => {
  const { lng, lat, zoom, rollDeg } = values;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat) || !isFiniteNumber(zoom)) {
    return null;
  }

  const target = projectLeafletViewToViewSyncTarget(
    lng,
    lat,
    zoom,
    fallbackAltitudeM,
    DEFAULT_LEAFLET_FOV_VERTICAL_RAD
  );
  if (!target) {
    return null;
  }

  if (!isFiniteNumber(rollDeg)) {
    return target;
  }

  return {
    ...target,
    roll: degToRadNumeric(rollDeg)! as ViewState["roll"],
  };
};

export const leafletAdapter = {
  toFramework(viewState: ViewState): LeafletViewValues | null {
    const projection = projectViewSyncTargetToLeaflet(viewState, {
      fovVertical: viewState.fovVertical ?? DEFAULT_LEAFLET_FOV_VERTICAL_RAD,
    });
    if (!projection) {
      return null;
    }

    return {
      lng: projection.center.lng,
      lat: projection.center.lat,
      zoom: projection.zoom,
    };
  },

  toCarmaViewState(
    values: LeafletViewValues,
    fallbackAltitudeM: number = 200
  ): ViewState | null {
    return toCarmaViewState(values, fallbackAltitudeM);
  },
};

export const readViewStateFromLeafletMap = (
  map: LeafletMap | null | undefined,
  fallbackAltitudeM: number = 200
): ViewState | null => {
  if (!map || !(map as LeafletMap & { _loaded?: boolean })._loaded) {
    return null;
  }

  try {
    const center = map.getCenter();
    const rollDeg = (
      map as LeafletMap & {
        getRoll?: () => number;
      }
    ).getRoll?.();

    return leafletAdapter.toCarmaViewState(
      {
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
        ...(isFiniteNumber(rollDeg) ? { rollDeg } : {}),
      },
      fallbackAltitudeM
    );
  } catch {
    return null;
  }
};
