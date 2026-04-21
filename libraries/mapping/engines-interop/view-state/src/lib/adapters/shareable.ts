import {
  readHorizontalFovFromVertical,
  readLongerEdgeFovFromIntrinsics,
  readMetersPerCssPixel,
  readRangeFromMetersPerCssPixel,
  readVerticalFovFromLongerEdge,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import { formatFixedNumber } from "@carma-commons/utils/number-format";
import { WEB_MERCATOR_MAX_LATITUDE_DEG } from "@carma-geo/data-structures";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma-geo/utils";
import { clamp, isFiniteNumber, isZeroish } from "@carma-commons/math";
import { degToRadNumeric, radToDegNumeric, zeroToTwoPi } from "@carma-units";
import type { Meters, Radians } from "@carma-units";

import { buildViewState } from "../core/construct";
import { deriveView } from "../core/derivations";
import {
  VIEW_STATE_SOURCE,
  type ViewState,
  type ViewStateHashCodec,
  type ViewStateSource,
} from "../core/types";
import { resolveViewStateForViewport } from "../core/viewport";
import {
  HASH_ZOOM_CONVENTION,
  readViewStateHashNumber,
  type HashZoomConvention,
} from "../core/viewStateHash";
import type { ShareableViewState } from "../types";
export type ShareableViewStatePrecision = {
  lat: number;
  lng: number;
  zoom: number;
  altitude: number;
  bearing: number;
  pitch: number;
  roll: number;
  fov: number;
};

export type ShareableViewStateAdapterOptions = {
  defaultFovDeg?: number;
  zoomConvention?: HashZoomConvention;
  precision?: Partial<ShareableViewStatePrecision>;
  restorePitchLimitsRad?: {
    minPitchRad?: Radians;
    maxPitchRad?: Radians;
  };
  source?: ViewStateSource;
  sourceId?: string;
};

export type ShareableViewStateHashCodecOptions =
  ShareableViewStateAdapterOptions & {
    cameraLimiterOptions?: {
      pitchLimiter?: boolean;
      minPitchDeg?: number;
    };
  };

export class ShareableViewStateEncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareableViewStateEncodingError";
  }
}

const DEFAULT_FOV_DEG = 45;
const DEFAULT_MIN_PITCH_RAD = 0 as Radians;
const DEFAULT_MAX_CANONICAL_PITCH_RAD = Math.PI as Radians;
const DEFAULT_MIN_RANGE_M = 10;
const DEFAULT_SHAREABLE_VIEW_STATE_SOURCE_ID = "shareable-hash-restore";
const MAPLIBRE_TILE_SIZE_PX = 512;

const HASH_BEARING_ZERO_EPSILON_DEG = 0.01;
const HASH_PITCH_ZERO_EPSILON_DEG = 0.01;
const HASH_ROLL_ZERO_EPSILON_DEG = 0.01;

export const DEFAULT_SHAREABLE_VIEW_STATE_PRECISION: ShareableViewStatePrecision =
  {
    lat: 7,
    lng: 7,
    zoom: 3,
    altitude: 2,
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

const resolveRestorePitchLimitsRad = (
  options?: ShareableViewStateAdapterOptions
): { minPitchRad: Radians; maxPitchRad: Radians } => {
  const requestedMinPitchRad = options?.restorePitchLimitsRad?.minPitchRad;
  const requestedMaxPitchRad = options?.restorePitchLimitsRad?.maxPitchRad;
  const minPitchRad = isFiniteNumber(requestedMinPitchRad)
    ? (clamp(
        requestedMinPitchRad,
        DEFAULT_MIN_PITCH_RAD,
        DEFAULT_MAX_CANONICAL_PITCH_RAD
      ) as Radians)
    : DEFAULT_MIN_PITCH_RAD;
  const maxPitchRad = isFiniteNumber(requestedMaxPitchRad)
    ? (clamp(
        requestedMaxPitchRad,
        minPitchRad,
        DEFAULT_MAX_CANONICAL_PITCH_RAD
      ) as Radians)
    : DEFAULT_MAX_CANONICAL_PITCH_RAD;

  return {
    minPitchRad,
    maxPitchRad,
  };
};

const resolveHashCodecOptions = (
  options: ShareableViewStateHashCodecOptions = {}
): ShareableViewStateAdapterOptions => {
  const { cameraLimiterOptions, ...adapterOptions } = options;
  if (adapterOptions.restorePitchLimitsRad) {
    return adapterOptions;
  }

  if (
    cameraLimiterOptions?.pitchLimiter === false ||
    !isFiniteNumber(cameraLimiterOptions?.minPitchDeg)
  ) {
    return adapterOptions;
  }

  // CARMA view pitch convention uses 0 at nadir and PI/2 at the horizon.
  // The shareable canonical pitch follows the same convention, so a Cesium
  // product limiter configured via minPitchDeg maps directly to a canonical
  // maximum pitch of minPitchDeg.
  return {
    ...adapterOptions,
    restorePitchLimitsRad: {
      maxPitchRad: degToRadNumeric(
        cameraLimiterOptions.minPitchDeg
      )! as Radians,
    },
  };
};

const clampPitchRadToLimits = (
  pitchRad: number | undefined,
  pitchLimitsRad: { minPitchRad: Radians; maxPitchRad: Radians }
): Radians | undefined =>
  isFiniteNumber(pitchRad)
    ? (clamp(
        pitchRad,
        pitchLimitsRad.minPitchRad,
        pitchLimitsRad.maxPitchRad
      ) as Radians)
    : undefined;

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

  if (
    !isFiniteNumber(lat) ||
    !isFiniteNumber(lng) ||
    !isFiniteNumber(altitude)
  ) {
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

  if (!isFiniteNumber(projectedZoom) || !isWithinWebMercatorLat(lat)) {
    throw new ShareableViewStateEncodingError(
      "Cannot encode ShareableViewState without a valid Web Mercator zoom."
    );
  }
  const hashZoom = roundFixedNumber(
    formatCanonicalZoomForHash(projectedZoom, zoomConvention),
    precision.zoom
  );
  if (!isFiniteNumber(hashZoom)) {
    throw new ShareableViewStateEncodingError(
      "Cannot encode ShareableViewState without a finite hash zoom."
    );
  }
  shareable.zoom = hashZoom;

  const bearing = roundFixedNumber(
    readBearingDegreesFromViewState(view.bearing),
    precision.bearing
  );
  if (isFiniteNumber(bearing) && !isWrappedBearingCloseToZeroDeg(bearing)) {
    shareable.bearing = bearing;
  }

  const clampedPitchRad = clampPitchRadToLimits(view.pitch, {
    minPitchRad: DEFAULT_MIN_PITCH_RAD,
    maxPitchRad: DEFAULT_MAX_CANONICAL_PITCH_RAD,
  });
  const pitch = roundFixedNumber(
    isFiniteNumber(clampedPitchRad)
      ? radToDegNumeric(clampedPitchRad)
      : undefined,
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

  if (
    !isFiniteNumber(lat) ||
    !isFiniteNumber(lng) ||
    !isFiniteNumber(altitude)
  ) {
    return null;
  }

  const zoom = readRoundedShareableNumber(value.zoom, precision.zoom);
  if (!isFiniteNumber(zoom)) {
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
  const restorePitchLimitsRad = resolveRestorePitchLimitsRad(options);

  const normalizedShareable = readShareableViewState(viewState, options);

  if (!normalizedShareable) {
    throw new Error(
      "Invalid ShareableViewState: lat/lng/altitude and zoom are required."
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
    if (!isFiniteNumber(normalizedZoom)) {
      return null;
    }

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
    return isFiniteNumber(fromZoom) ? fromZoom : null;
  })();

  if (!isFiniteNumber(rangeM)) {
    throw new Error(
      "Invalid ShareableViewState: zoom could not be resolved to a finite range."
    );
  }

  const bearingRad = isFiniteNumber(normalizedShareable.bearing)
    ? (zeroToTwoPi(
        degToRadNumeric(normalizedShareable.bearing)! as Radians
      ) as Radians)
    : (degToRadNumeric(0)! as Radians);
  const pitchRad = isFiniteNumber(normalizedShareable.pitch)
    ? clampPitchRadToLimits(
        degToRadNumeric(normalizedShareable.pitch),
        restorePitchLimitsRad
      ) ?? (degToRadNumeric(0)! as Radians)
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
                ...(isFiniteNumber(fovLongerEdge) ? { fovLongerEdge } : {}),
              },
            },
          }
        : {}),
    },
  });
};

export const createViewStateShareableHashCodec = (
  options: ShareableViewStateHashCodecOptions = {}
): ViewStateHashCodec => ({
  encode: (state) => {
    if (!state) {
      return null;
    }

    return applyToShareableViewState(state, resolveHashCodecOptions(options));
  },
  decode: (hashValues) => {
    const resolvedOptions = resolveHashCodecOptions(options);
    const shareableViewState = readShareableViewState(
      hashValues,
      resolvedOptions
    );
    return shareableViewState
      ? readFromShareableViewState(shareableViewState, resolvedOptions)
      : null;
  },
});

export const readLeafletHomeViewState = (
  viewState: ShareableViewState,
  options: Omit<ShareableViewStateAdapterOptions, "zoomConvention"> = {}
): ViewState =>
  readFromShareableViewState(viewState, {
    ...options,
    zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
  });

export { resolveViewStateForViewport };
