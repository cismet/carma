import type { Map as MapLibreMap } from "maplibre-gl";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
  clampLatitudeToWebMercatorExtent,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";
import { clamp, isFiniteNumber, isZeroish } from "@carma/math";
import {
  degToRadNumeric,
  negativePiToPi,
  radToDegNumeric,
  zeroToTwoPi,
} from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import type { ViewState } from "../core/types";
import {
  DEFAULT_FOV_DEG,
  DEFAULT_MAX_PITCH_DEG,
  DEFAULT_MIN_RANGE_M,
  type MapLibreAdapterOptions,
  type MapLibreViewValues,
} from "./types";
import {
  normalizeBearingRadToDeg,
  readMetersPerCssPixel,
  readRangeFromMetersPerCssPixel,
} from "./sharedProjection";

const MAPLIBRE_TILE_SIZE_PX = 512;
const MAPLIBRE_PROJECTION_MIN_RANGE_M = 0.01;
const HASH_BEARING_ZERO_EPSILON_DEG = 0.01;
const HASH_BEARING_ZERO_EPSILON_RAD = degToRadNumeric(
  HASH_BEARING_ZERO_EPSILON_DEG
)!;
const HASH_PITCH_ZERO_EPSILON_DEG = 0.01;

export type ViewSyncMapProjection = {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
};

const resolveOptions = (
  options?: MapLibreAdapterOptions
): Required<MapLibreAdapterOptions> => ({
  defaultFovDeg: options?.defaultFovDeg ?? DEFAULT_FOV_DEG,
  maxPitchDeg: options?.maxPitchDeg ?? DEFAULT_MAX_PITCH_DEG,
  minRangeM: options?.minRangeM ?? DEFAULT_MIN_RANGE_M,
});

const clampLat = (latitudeDeg: number): number =>
  clamp(
    latitudeDeg,
    -WEB_MERCATOR_MAX_LATITUDE_DEG,
    WEB_MERCATOR_MAX_LATITUDE_DEG
  );

const isWithinWebMercatorLat = (latitudeDeg: number): boolean =>
  Math.abs(latitudeDeg) <= WEB_MERCATOR_MAX_LATITUDE_DEG;

const HASH_ROLL_ZERO_EPSILON_DEG = 0.01;
const HASH_ROLL_ZERO_EPSILON_RAD = degToRadNumeric(HASH_ROLL_ZERO_EPSILON_DEG)!;

const isHashPitchCloseToZeroDeg = (pitchDeg: number | undefined): boolean =>
  !isFiniteNumber(pitchDeg) ||
  Math.abs(pitchDeg) <= HASH_PITCH_ZERO_EPSILON_DEG;

const coerceFiniteNumber = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return isFiniteNumber(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const projectViewSyncTargetToMapLibre = (
  target: ViewState,
  options: {
    fovVertical?: number;
    tileSizePx?: number;
    maxPitchDeg?: number;
  } = {}
): ViewSyncMapProjection | null => {
  const {
    fovVertical,
    tileSizePx = MAPLIBRE_TILE_SIZE_PX,
    maxPitchDeg = DEFAULT_MAX_PITCH_DEG,
  } = options;
  const storedZoom = isFiniteNumber(target.zoom) ? target.zoom : undefined;
  if (isFiniteNumber(storedZoom)) {
    const bearingDeg = normalizeBearingRadToDeg(target.bearing);
    const pitchDeg = clamp(radToDegNumeric(target.pitch), 0, maxPitchDeg);

    return {
      lng: radToDegNumeric(target.longitude),
      lat: radToDegNumeric(target.latitude),
      zoom: storedZoom,
      bearing: bearingDeg,
      pitch: pitchDeg,
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

  const bearingDeg = normalizeBearingRadToDeg(target.bearing);
  const pitchDeg = clamp(radToDegNumeric(target.pitch), 0, maxPitchDeg);

  return {
    lng: radToDegNumeric(target.longitude),
    lat: radToDegNumeric(target.latitude),
    zoom,
    bearing: bearingDeg,
    pitch: pitchDeg,
  };
};

export const projectMapLibreViewToViewSyncTarget = (
  lngDeg: number,
  latDeg: number,
  zoom: number,
  anchorAltitudeM: number,
  fovVertical: number,
  options: {
    bearingDeg?: number;
    pitchDeg?: number;
    tileSizePx?: number;
  } = {}
): ViewState | null => {
  const {
    bearingDeg = 0,
    pitchDeg = 0,
    tileSizePx = MAPLIBRE_TILE_SIZE_PX,
  } = options;
  const latitudeRad = degToRadNumeric(latDeg) as Radians;
  const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad,
    { tileSize: tileSizePx }
  );
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel,
    fovRad: fovVertical,
    minRangeM: MAPLIBRE_PROJECTION_MIN_RANGE_M,
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
    zoom,
    bearing: zeroToTwoPi(degToRadNumeric(bearingDeg)! as Radians) as Radians,
    pitch: degToRadNumeric(pitchDeg) as Radians,
    range: rangeM as Meters,
    ...(isFiniteNumber(fovVertical)
      ? {
          fovVertical: fovVertical as Radians,
        }
      : {}),
  };
};

const toMapLibreBearingDeg = (
  bearingRad: number | undefined
): number | undefined => {
  if (!isFiniteNumber(bearingRad)) {
    return undefined;
  }
  return radToDegNumeric(zeroToTwoPi(bearingRad as Radians) as number)!;
};

const toHashBearingDeg = (
  bearingRad: number | undefined
): number | undefined => {
  if (!isFiniteNumber(bearingRad)) {
    return undefined;
  }

  const normalizedBearingRad = zeroToTwoPi(bearingRad as Radians) as number;

  return radToDegNumeric(normalizedBearingRad)!;
};

const isWrappedBearingCloseToZeroRad = (
  bearingRad: number | undefined
): boolean => {
  if (!isFiniteNumber(bearingRad)) {
    return true;
  }

  return (
    Math.abs(negativePiToPi(bearingRad as Radians) as number) <=
    HASH_BEARING_ZERO_EPSILON_RAD
  );
};

const isWrappedRollCloseToZeroRad = (rollRad: number | undefined): boolean => {
  if (!isFiniteNumber(rollRad)) {
    return true;
  }

  return (
    Math.abs(negativePiToPi(rollRad as Radians) as number) <=
    HASH_ROLL_ZERO_EPSILON_RAD
  );
};

const toMapLibreFrameworkView = (
  viewState: ViewState,
  options?: MapLibreAdapterOptions
): MapLibreViewValues | null => {
  const { defaultFovDeg, maxPitchDeg } = resolveOptions(options);

  const projection = projectViewSyncTargetToMapLibre(viewState, {
    fovVertical:
      viewState.fovVertical ?? (degToRadNumeric(defaultFovDeg)! as Radians),
    maxPitchDeg,
  });
  if (!projection) {
    return null;
  }

  const params: MapLibreViewValues = {
    lng: projection.lng,
    lat: projection.lat,
    zoom: projection.zoom,
    altitude: viewState.altitude,
  };

  if (isFiniteNumber(projection.bearing) && !isZeroish(projection.bearing)) {
    params.bearing = projection.bearing;
  }

  if (isFiniteNumber(projection.pitch) && projection.pitch > 0) {
    params.pitch = projection.pitch;
  }

  return params;
};

const toCarmaViewStateFromMapLibre = (
  values: MapLibreViewValues & { fovDeg?: number },
  options?: MapLibreAdapterOptions
): ViewState | null => {
  const { defaultFovDeg, maxPitchDeg, minRangeM } = resolveOptions(options);
  const { lng, lat, zoom, altitude } = values;
  if (
    !isFiniteNumber(lng) ||
    !isFiniteNumber(lat) ||
    !isFiniteNumber(zoom) ||
    !isFiniteNumber(altitude)
  ) {
    return null;
  }

  const fovDeg =
    isFiniteNumber(values.fovDeg) && values.fovDeg > 0
      ? values.fovDeg
      : defaultFovDeg;

  const target = projectMapLibreViewToViewSyncTarget(
    lng,
    clampLat(lat),
    zoom,
    altitude,
    degToRadNumeric(fovDeg)!,
    {
      bearingDeg: isFiniteNumber(values.bearing) ? values.bearing : 0,
      pitchDeg: isFiniteNumber(values.pitch) ? values.pitch : 0,
    }
  );
  if (!target) {
    return null;
  }

  const clampedRangeM =
    isFiniteNumber(target.range) && target.range < minRangeM
      ? minRangeM
      : target.range;

  return {
    ...target,
    latitude: clampLatitudeToWebMercatorExtent(target.latitude),
    zoom,
    ...(isFiniteNumber(values.bearing)
      ? {
          bearing: zeroToTwoPi(
            degToRadNumeric(values.bearing)! as Radians
          ) as Radians,
        }
      : {}),
    ...(isFiniteNumber(values.pitch)
      ? {
          pitch: degToRadNumeric(
            clamp(values.pitch, 0, maxPitchDeg)
          )! as Radians,
        }
      : {
          pitch: degToRadNumeric(0)! as Radians,
        }),
    ...(isFiniteNumber(values.roll)
      ? { roll: degToRadNumeric(values.roll)! as Radians }
      : {}),
    ...(isFiniteNumber(clampedRangeM)
      ? { range: clampedRangeM as Meters }
      : {}),
    ...(isFiniteNumber(values.fovDeg)
      ? { fovVertical: degToRadNumeric(values.fovDeg)! as Radians }
      : {}),
  };
};

export const readHashParamsFromViewState = (
  viewState: ViewState,
  options?: MapLibreAdapterOptions
): Record<string, number> => {
  const { defaultFovDeg, maxPitchDeg } = resolveOptions(options);
  const latitudeDeg = radToDegNumeric(viewState.latitude);
  const hasWebMercatorLatitude =
    isFiniteNumber(latitudeDeg) && isWithinWebMercatorLat(latitudeDeg);

  const params: Record<string, number> = {
    lng: radToDegNumeric(viewState.longitude),
    lat: latitudeDeg,
    altitude: viewState.altitude,
  };

  const projected = hasWebMercatorLatitude
    ? toMapLibreFrameworkView(viewState, { defaultFovDeg, maxPitchDeg })
    : null;

  if (projected) {
    params.zoom = projected.zoom;
    const bearingDeg = toHashBearingDeg(viewState.bearing);
    if (
      isFiniteNumber(bearingDeg) &&
      !isWrappedBearingCloseToZeroRad(viewState.bearing)
    ) {
      params.bearing = bearingDeg;
    }
    if (!isHashPitchCloseToZeroDeg(projected.pitch)) {
      params.pitch = projected.pitch;
    }
  } else {
    params.range = viewState.range;
  }

  if (!isWrappedRollCloseToZeroRad(viewState.roll)) {
    params.roll = radToDegNumeric(viewState.roll)!;
  }

  const effectiveFovDeg = isFiniteNumber(viewState.fovVertical)
    ? radToDegNumeric(viewState.fovVertical)!
    : undefined;
  if (
    isFiniteNumber(effectiveFovDeg) &&
    !isZeroish(effectiveFovDeg - defaultFovDeg)
  ) {
    params.fov = effectiveFovDeg;
  }

  return params;
};

export const readViewStateFromHashValues = (
  values: Record<string, unknown>,
  options?: MapLibreAdapterOptions
): ViewState | null => {
  const { defaultFovDeg, maxPitchDeg, minRangeM } = resolveOptions(options);
  const lng = coerceFiniteNumber(values.lng);
  const lat = coerceFiniteNumber(values.lat);
  const altitude = coerceFiniteNumber(values.altitude);
  const zoom = coerceFiniteNumber(values.zoom);
  const range = coerceFiniteNumber(values.range);
  const bearing = coerceFiniteNumber(values.bearing);
  const pitch = coerceFiniteNumber(values.pitch);
  const roll = coerceFiniteNumber(values.roll);
  const fovDeg = coerceFiniteNumber(values.fov);

  if (
    !isFiniteNumber(lng) ||
    !isFiniteNumber(lat) ||
    !isFiniteNumber(altitude)
  ) {
    return null;
  }

  const hasWebMercatorLatitude = isWithinWebMercatorLat(lat);

  if (isFiniteNumber(zoom) && hasWebMercatorLatitude) {
    return toCarmaViewStateFromMapLibre(
      {
        lng,
        lat,
        zoom,
        altitude,
        ...(isFiniteNumber(bearing) ? { bearing } : {}),
        ...(isFiniteNumber(pitch) ? { pitch } : {}),
        ...(isFiniteNumber(roll) ? { roll } : {}),
        ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      },
      options
    );
  }

  if (isFiniteNumber(range)) {
    const clampedRangeM = range < minRangeM ? minRangeM : range;
    return {
      longitude: degToRadNumeric(lng)! as Radians,
      latitude: degToRadNumeric(lat)! as Radians,
      altitude: altitude as Meters,
      ...(isFiniteNumber(zoom) ? { zoom } : {}),
      bearing: isFiniteNumber(bearing)
        ? (zeroToTwoPi(degToRadNumeric(bearing)! as Radians) as Radians)
        : (degToRadNumeric(0)! as Radians),
      pitch: isFiniteNumber(pitch)
        ? (degToRadNumeric(clamp(pitch, 0, maxPitchDeg))! as Radians)
        : (degToRadNumeric(0)! as Radians),
      ...(isFiniteNumber(roll)
        ? { roll: degToRadNumeric(roll)! as Radians }
        : {}),
      range: clampedRangeM as Meters,
      ...(isFiniteNumber(fovDeg)
        ? { fovVertical: degToRadNumeric(fovDeg)! as Radians }
        : {
            fovVertical: degToRadNumeric(defaultFovDeg)! as Radians,
          }),
    };
  }

  if (!isFiniteNumber(zoom)) {
    return null;
  }

  return toCarmaViewStateFromMapLibre(
    {
      lng,
      lat,
      zoom,
      altitude,
      ...(isFiniteNumber(bearing) ? { bearing } : {}),
      ...(isFiniteNumber(pitch) ? { pitch } : {}),
      ...(isFiniteNumber(roll) ? { roll } : {}),
      ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
    },
    options
  );
};

export const maplibreAdapter = {
  toFramework: toMapLibreFrameworkView,
  toCarmaViewState: toCarmaViewStateFromMapLibre,
  toHashParams: readHashParamsFromViewState,
  fromHashValues: readViewStateFromHashValues,
};

export const readViewStateFromMapLibreMap = (
  map: MapLibreMap | null | undefined,
  altitudeM: number,
  options?: MapLibreAdapterOptions
): ViewState | null => {
  if (!map || !isFiniteNumber(altitudeM)) {
    return null;
  }

  const center = map.getCenter();
  const roll = (
    map as MapLibreMap & {
      getRoll?: () => number;
    }
  ).getRoll?.();

  return maplibreAdapter.toCarmaViewState(
    {
      lng: center.lng,
      lat: center.lat,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      ...(isFiniteNumber(roll) ? { roll } : {}),
      altitude: altitudeM,
    },
    options
  );
};
