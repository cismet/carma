import { formatFixedNumber } from "@carma-commons/utils/number-format";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
} from "@carma/geo/utils";
import { clamp, isFiniteNumber, isZeroish } from "@carma/math";
import {
  readHorizontalFovFromVertical,
  readLongerEdgeFovFromIntrinsics,
  readMetersPerCssPixel,
  readRangeFromMetersPerCssPixel,
  readVerticalFovFromLongerEdge,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import {
  degToRadNumeric,
  radToDegNumeric,
  zeroToTwoPi,
} from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { buildViewState } from "../core/construct";
import { deriveView } from "../core/derivations";
import { resolveViewStateForViewport } from "../core/viewport";
import {
  HASH_ZOOM_CONVENTION,
  readViewStateHashNumber,
  type HashZoomConvention,
} from "../core/viewStateHash";
import {
  VIEW_STATE_SOURCE,
  type ViewState,
  type ViewStateHashCodec,
  type ViewStateSource,
} from "../core/types";
import type { ShareableViewState } from "../types";

export type ShareableViewStatePrecision = {
  lat: number;
  lng: number;
  zoom: number;
  altitude: number;
  range: number;
  bearing: number;
  pitch: number;
  roll: number;
  fov: number;
};

export type ShareableViewStateAdapterOptions = {
  defaultFovDeg?: number;
  zoomConvention?: HashZoomConvention;
  precision?: Partial<ShareableViewStatePrecision>;
  source?: ViewStateSource;
  sourceId?: string;
};

export type ViewStateShareableHashCodecOptions =
  ShareableViewStateAdapterOptions;

const DEFAULT_FOV_DEG = 45;
const DEFAULT_MAX_PITCH_DEG = 85;
const DEFAULT_MIN_RANGE_M = 10;
const DEFAULT_SHAREABLE_VIEW_STATE_SOURCE_ID = "shareable-hash-restore";
const MAPLIBRE_TILE_SIZE_PX = 512;

const HASH_BEARING_ZERO_EPSILON_DEG = 0.01;
const HASH_PITCH_ZERO_EPSILON_DEG = 0.01;
const HASH_ROLL_ZERO_EPSILON_DEG = 0.01;

export const DEFAULT_SHAREABLE_VIEW_STATE_PRECISION: ShareableViewStatePrecision = {
  lat: 7,
  lng: 7,
  zoom: 3,
  altitude: 2,
  range: 2,
  bearing: 2,
  pitch: 2,
  roll: 2,
  fov: 2,
};

const resolvePrecision = (
  options?: ShareableViewStateAdapterOptions
): ShareableViewStatePrecision => ({
  ...DEFAULT_SHAREABLE_VIEW_STATE_PRECISION,
  ...(options?.precision ?? {}),
});

const roundFixedNumber = (
  value: number | undefined,
  fixedDigits: number
): number | undefined => {
  const formatted = formatFixedNumber(value, fixedDigits, {
    trimTrailingZeros: false,
  });
  if (formatted === undefined) {
    return undefined;
  }

  const rounded = Number(formatted);
  return Number.isFinite(rounded) ? rounded : undefined;
};

const readRoundedShareableNumber = (
  value: unknown,
  fixedDigits: number
): number | undefined =>
  roundFixedNumber(readViewStateHashNumber(value), fixedDigits);

const toCameraIntrinsics = (
  viewState: ShareableViewState,
  options?: ShareableViewStateAdapterOptions
): CameraIntrinsics => {
  const defaultFovDeg = options?.defaultFovDeg ?? DEFAULT_FOV_DEG;
  const resolvedFovDeg = isFiniteNumber(viewState.fov)
    ? viewState.fov
    : defaultFovDeg;
  const resolvedFovRad = degToRadNumeric(resolvedFovDeg);

  if (!isFiniteNumber(resolvedFovRad)) {
    return {};
  }

  return {
    fov: resolvedFovRad as CameraIntrinsics["fov"],
    ...(isFiniteNumber(viewState.fov)
      ? {
          fovHorizontal: resolvedFovRad as CameraIntrinsics["fovHorizontal"],
        }
      : {}),
  };
};

const isWithinWebMercatorLat = (latitudeDeg: number): boolean =>
  Math.abs(latitudeDeg) <= WEB_MERCATOR_MAX_LATITUDE_DEG;

const clampWebMercatorLatitudeDeg = (latitudeDeg: number): number =>
  clamp(
    latitudeDeg,
    -WEB_MERCATOR_MAX_LATITUDE_DEG,
    WEB_MERCATOR_MAX_LATITUDE_DEG
  );

const normalizeDegrees360 = (degrees: number): number => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const normalizeDegrees180 = (degrees: number): number => {
  const normalized = normalizeDegrees360(degrees);
  return normalized > 180 ? normalized - 360 : normalized;
};

const readBearingDegreesFromViewState = (
  bearingRad: number | undefined
): number | undefined =>
  isFiniteNumber(bearingRad)
    ? normalizeDegrees360(radToDegNumeric(bearingRad)!)
    : undefined;

const isWrappedBearingCloseToZeroDeg = (
  bearingDeg: number | undefined
): boolean =>
  !isFiniteNumber(bearingDeg) ||
  Math.abs(normalizeDegrees180(bearingDeg)) <= HASH_BEARING_ZERO_EPSILON_DEG;

const isWrappedRollCloseToZeroDeg = (rollDeg: number | undefined): boolean =>
  !isFiniteNumber(rollDeg) ||
  Math.abs(normalizeDegrees180(rollDeg)) <= HASH_ROLL_ZERO_EPSILON_DEG;

const isHashPitchCloseToZeroDeg = (pitchDeg: number | undefined): boolean =>
  !isFiniteNumber(pitchDeg) ||
  Math.abs(pitchDeg) <= HASH_PITCH_ZERO_EPSILON_DEG;

const normalizeHashZoomToCanonical = (
  zoom: number,
  convention: HashZoomConvention
): number =>
  convention === HASH_ZOOM_CONVENTION.LEAFLET_256 ? zoom - 1 : zoom;

const formatCanonicalZoomForHash = (
  zoom: number,
  convention: HashZoomConvention
): number =>
  convention === HASH_ZOOM_CONVENTION.LEAFLET_256 ? zoom + 1 : zoom;

export const applyToShareableViewState = (
  state: ViewState,
  options: ShareableViewStateAdapterOptions = {}
): ShareableViewState => {
  const view = deriveView(state);
  const precision = resolvePrecision(options);
  const defaultFovDeg = options.defaultFovDeg ?? DEFAULT_FOV_DEG;
  const zoomConvention =
    options.zoomConvention ?? HASH_ZOOM_CONVENTION.MAPLIBRE_512;

  const lat = roundFixedNumber(radToDegNumeric(view.latitude), precision.lat);
  const lng = roundFixedNumber(radToDegNumeric(view.longitude), precision.lng);
  const altitude = roundFixedNumber(view.altitude, precision.altitude);

  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || !isFiniteNumber(altitude)) {
    throw new Error("Failed to derive ShareableViewState from ViewState.");
  }

  const shareable: ShareableViewState = {
    lat,
    lng,
    altitude,
  };

  const projectedZoom = isFiniteNumber(view.zoom)
    ? view.zoom
    : (() => {
        const verticalFovDeg = isFiniteNumber(state.intrinsics.fov)
          ? radToDegNumeric(state.intrinsics.fov)!
          : defaultFovDeg;

        if (
          !isFiniteNumber(view.range) ||
          !isFiniteNumber(verticalFovDeg) ||
          !isWithinWebMercatorLat(lat)
        ) {
          return undefined;
        }

        const metersPerCssPixel = readMetersPerCssPixel({
          rangeM: view.range,
          fovRad: degToRadNumeric(verticalFovDeg)!,
        });
        return isFiniteNumber(metersPerCssPixel)
          ? getZoomFromPixelResolutionAtLatitudeRad(
              metersPerCssPixel as Meters,
              view.latitude,
              { tileSize: MAPLIBRE_TILE_SIZE_PX }
            )
          : undefined;
      })();

  if (isFiniteNumber(projectedZoom) && isWithinWebMercatorLat(lat)) {
    const hashZoom = roundFixedNumber(
      formatCanonicalZoomForHash(projectedZoom, zoomConvention),
      precision.zoom
    );
    if (isFiniteNumber(hashZoom)) {
      shareable.zoom = hashZoom;
    }
  } else if (isFiniteNumber(view.range)) {
    const roundedRange = roundFixedNumber(view.range, precision.range);
    if (isFiniteNumber(roundedRange)) {
      shareable.range = roundedRange;
    }
  }

  const bearing = roundFixedNumber(
    readBearingDegreesFromViewState(view.bearing),
    precision.bearing
  );
  if (isFiniteNumber(bearing) && !isWrappedBearingCloseToZeroDeg(bearing)) {
    shareable.bearing = bearing;
  }

  const pitch = roundFixedNumber(
    clamp(radToDegNumeric(view.pitch), 0, DEFAULT_MAX_PITCH_DEG),
    precision.pitch
  );
  if (!isHashPitchCloseToZeroDeg(pitch)) {
    shareable.pitch = pitch;
  }

  const roll = roundFixedNumber(radToDegNumeric(view.roll), precision.roll);
  if (isFiniteNumber(roll) && !isWrappedRollCloseToZeroDeg(roll)) {
    shareable.roll = roll;
  }

  const longerEdgeFovDeg = roundFixedNumber(
    radToDegNumeric(readLongerEdgeFovFromIntrinsics(state.intrinsics)),
    precision.fov
  );
  const hasNonDefaultLongerEdgeFov =
    isFiniteNumber(longerEdgeFovDeg) &&
    !isZeroish(longerEdgeFovDeg - defaultFovDeg);

  if (hasNonDefaultLongerEdgeFov) {
    shareable.fov = longerEdgeFovDeg;
  }

  return shareable;
};

export const readShareableViewState = (
  value: Record<string, unknown>,
  options: ShareableViewStateAdapterOptions = {}
): ShareableViewState | null => {
  const precision = resolvePrecision(options);
  const lat = readRoundedShareableNumber(value.lat, precision.lat);
  const lng = readRoundedShareableNumber(value.lng, precision.lng);
  const altitude = readRoundedShareableNumber(
    value.altitude,
    precision.altitude
  );

  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || !isFiniteNumber(altitude)) {
    return null;
  }

  const zoom = readRoundedShareableNumber(value.zoom, precision.zoom);
  const range = readRoundedShareableNumber(value.range, precision.range);

  if (!isFiniteNumber(zoom) && !isFiniteNumber(range)) {
    return null;
  }

  const bearing = readRoundedShareableNumber(value.bearing, precision.bearing);
  const pitch = readRoundedShareableNumber(value.pitch, precision.pitch);
  const roll = readRoundedShareableNumber(value.roll, precision.roll);
  const fov = readRoundedShareableNumber(value.fov, precision.fov);

  return {
    lat,
    lng,
    altitude,
    ...(isFiniteNumber(zoom) ? { zoom } : {}),
    ...(isFiniteNumber(range) ? { range } : {}),
    ...(isFiniteNumber(bearing) ? { bearing } : {}),
    ...(isFiniteNumber(pitch) ? { pitch } : {}),
    ...(isFiniteNumber(roll) ? { roll } : {}),
    ...(isFiniteNumber(fov) ? { fov } : {}),
  };
};

export const readFromShareableViewState = (
  viewState: ShareableViewState,
  options?: ShareableViewStateAdapterOptions
): ViewState => {
  const defaultFovDeg = options?.defaultFovDeg ?? DEFAULT_FOV_DEG;
  const zoomConvention =
    options?.zoomConvention ?? HASH_ZOOM_CONVENTION.MAPLIBRE_512;

  const normalizedShareable = readShareableViewState(
    viewState as unknown as Record<string, unknown>,
    options
  );

  if (!normalizedShareable) {
    throw new Error(
      "Invalid ShareableViewState: lat/lng/altitude and zoom|range are required."
    );
  }

  const normalizedZoom = isFiniteNumber(normalizedShareable.zoom)
    ? normalizeHashZoomToCanonical(normalizedShareable.zoom, zoomConvention)
    : undefined;
  const effectiveLatitudeDeg = isFiniteNumber(normalizedZoom)
    ? clampWebMercatorLatitudeDeg(normalizedShareable.lat)
    : normalizedShareable.lat;

  const resolvedFovDeg = isFiniteNumber(normalizedShareable.fov)
    ? normalizedShareable.fov
    : defaultFovDeg;
  const resolvedFovRad = degToRadNumeric(resolvedFovDeg);

  if (!isFiniteNumber(resolvedFovRad)) {
    throw new Error("Invalid ShareableViewState: fov could not be resolved.");
  }

  const rangeM = (() => {
    if (isFiniteNumber(normalizedZoom)) {
      const latitudeRad = degToRadNumeric(effectiveLatitudeDeg)! as Radians;
      const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
        normalizedZoom,
        latitudeRad,
        { tileSize: MAPLIBRE_TILE_SIZE_PX }
      );
      const fromZoom = readRangeFromMetersPerCssPixel({
        metersPerCssPixel,
        fovRad: resolvedFovRad,
        minRangeM: DEFAULT_MIN_RANGE_M,
      });
      if (isFiniteNumber(fromZoom)) {
        return fromZoom;
      }
    }

    if (isFiniteNumber(normalizedShareable.range)) {
      return Math.max(normalizedShareable.range, DEFAULT_MIN_RANGE_M);
    }

    return null;
  })();

  if (!isFiniteNumber(rangeM)) {
    throw new Error(
      "Invalid ShareableViewState: either zoom or range must be finite."
    );
  }

  const bearingRad = isFiniteNumber(normalizedShareable.bearing)
    ? (zeroToTwoPi(
        degToRadNumeric(normalizedShareable.bearing)! as Radians
      ) as Radians)
    : (degToRadNumeric(0)! as Radians);
  const pitchRad = isFiniteNumber(normalizedShareable.pitch)
    ? (degToRadNumeric(
        clamp(normalizedShareable.pitch, 0, DEFAULT_MAX_PITCH_DEG)
      )! as Radians)
    : (degToRadNumeric(0)! as Radians);
  const rollRad = isFiniteNumber(normalizedShareable.roll)
    ? (degToRadNumeric(normalizedShareable.roll)! as Radians)
    : undefined;
  const fovLongerEdge = isFiniteNumber(normalizedShareable.fov)
    ? (degToRadNumeric(normalizedShareable.fov)! as Radians)
    : undefined;

  return buildViewState({
    longitude: degToRadNumeric(normalizedShareable.lng)! as Radians,
    latitude: degToRadNumeric(effectiveLatitudeDeg)! as Radians,
    altitude: normalizedShareable.altitude,
    bearing: bearingRad,
    pitch: pitchRad,
    ...(isFiniteNumber(rollRad) ? { roll: rollRad } : {}),
    range: rangeM,
    intrinsics: toCameraIntrinsics(normalizedShareable, options),
    metadata: {
      frameId: 0,
      timestampMs: Date.now(),
      sourceId: options?.sourceId ?? DEFAULT_SHAREABLE_VIEW_STATE_SOURCE_ID,
      source: options?.source ?? VIEW_STATE_SOURCE.RESTORE,
      ...(isFiniteNumber(normalizedZoom) || isFiniteNumber(fovLongerEdge)
        ? {
            restoreHints: {
              shareable: {
                ...(isFiniteNumber(normalizedZoom)
                  ? { zoom: normalizedZoom }
                  : {}),
                ...(isFiniteNumber(fovLongerEdge)
                  ? { fovLongerEdge }
                  : {}),
              },
            },
          }
        : {}),
    },
  });
};

export const createViewStateShareableHashCodec = (
  options: ViewStateShareableHashCodecOptions = {}
): ViewStateHashCodec => ({
  encode: (state) => {
    if (!state) {
      return null;
    }

    return applyToShareableViewState(state, options);
  },
  decode: (hashValues) => {
    const shareableViewState = readShareableViewState(hashValues, options);
    return shareableViewState
      ? readFromShareableViewState(shareableViewState, options)
      : null;
  },
});

export { resolveViewStateForViewport };
