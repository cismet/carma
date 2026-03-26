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
  negativePiToPi,
  radToDegNumeric,
  zeroToTwoPi,
} from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { buildViewState } from "../core/construct";
import { deriveView } from "../core/derivations";
import {
  HASH_ZOOM_CONVENTION,
  readViewStateHashNumber,
  type HashZoomConvention,
} from "../core/viewStateHash";
import {
  VIEW_STATE_SOURCE,
  type ViewState,
  type ViewStateHashValues,
  type ViewStateSource,
} from "../core/types";
import type { ShareableViewState } from "../types";

export type ShareableViewStateAdapterOptions = {
  defaultFovDeg?: number;
  zoomConvention?: HashZoomConvention;
  source?: ViewStateSource;
  sourceId?: string;
};

const DEFAULT_FOV_DEG = 45;
const DEFAULT_MAX_PITCH_DEG = 85;
const DEFAULT_MIN_RANGE_M = 10;
const DEFAULT_SHAREABLE_VIEW_STATE_SOURCE_ID = "shareable-hash-restore";
const MAPLIBRE_TILE_SIZE_PX = 512;

const HASH_BEARING_ZERO_EPSILON_DEG = 0.01;
const HASH_PITCH_ZERO_EPSILON_DEG = 0.01;
const HASH_ROLL_ZERO_EPSILON_DEG = 0.01;

const HASH_BEARING_ZERO_EPSILON_RAD = degToRadNumeric(
  HASH_BEARING_ZERO_EPSILON_DEG
)!;
const HASH_ROLL_ZERO_EPSILON_RAD = degToRadNumeric(HASH_ROLL_ZERO_EPSILON_DEG)!;

const HASH_NUMBER_PRECISION = {
  lat: 7,
  lng: 7,
  zoom: 3,
  distance: 2,
  angle: 2,
} as const;

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

const toCameraIntrinsics = (
  viewState: ShareableViewState,
  options?: ShareableViewStateAdapterOptions
): CameraIntrinsics => {
  const longerEdgeFov = viewState.fovLongerEdge;
  const verticalFov = viewState.fovVertical ?? longerEdgeFov;
  const horizontalFov = viewState.fovHorizontal ?? longerEdgeFov;
  const fallbackVerticalFov = isFiniteNumber(options?.defaultFovDeg)
    ? degToRadNumeric(options.defaultFovDeg)!
    : undefined;

  return {
    ...(isFiniteNumber(verticalFov)
      ? { fov: verticalFov as CameraIntrinsics["fov"] }
      : isFiniteNumber(fallbackVerticalFov)
      ? { fov: fallbackVerticalFov as CameraIntrinsics["fov"] }
      : {}),
    ...(isFiniteNumber(horizontalFov)
      ? {
          fovHorizontal: horizontalFov as CameraIntrinsics["fovHorizontal"],
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

const readLongerEdgeFovDegFromShareableViewState = (
  viewState: Pick<
    ShareableViewState,
    "fovVertical" | "fovHorizontal" | "fovLongerEdge"
  >
): number | undefined => {
  if (isFiniteNumber(viewState.fovLongerEdge)) {
    return radToDegNumeric(viewState.fovLongerEdge)!;
  }

  const finiteFovs = [viewState.fovVertical, viewState.fovHorizontal].filter(
    isFiniteNumber
  ) as number[];
  if (finiteFovs.length === 0) {
    return undefined;
  }

  return radToDegNumeric(Math.max(...finiteFovs))!;
};

const readVerticalFovDegFromShareableViewState = (
  viewState: Pick<ShareableViewState, "fovVertical">,
  defaultFovDeg: number
): number =>
  isFiniteNumber(viewState.fovVertical)
    ? radToDegNumeric(viewState.fovVertical)!
    : defaultFovDeg;

const readBearingDegFromShareableViewState = (
  bearingRad: number | undefined
): number | undefined => {
  if (!isFiniteNumber(bearingRad)) {
    return undefined;
  }

  return radToDegNumeric(zeroToTwoPi(bearingRad as Radians))!;
};

const isWrappedBearingCloseToZeroRad = (
  bearingRad: number | undefined
): boolean => {
  if (!isFiniteNumber(bearingRad)) {
    return true;
  }

  return (
    Math.abs(negativePiToPi(bearingRad as Radians)) <=
    HASH_BEARING_ZERO_EPSILON_RAD
  );
};

const isWrappedRollCloseToZeroRad = (rollRad: number | undefined): boolean => {
  if (!isFiniteNumber(rollRad)) {
    return true;
  }

  return (
    Math.abs(negativePiToPi(rollRad as Radians)) <= HASH_ROLL_ZERO_EPSILON_RAD
  );
};

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
  state: ViewState
): ShareableViewState => {
  const view = deriveView(state);
  const longerEdgeFov = readLongerEdgeFovFromIntrinsics(state.intrinsics);

  return {
    longitude: view.longitude,
    latitude: view.latitude,
    altitude: view.altitude,
    zoom: view.zoom,
    bearing: view.bearing,
    pitch: view.pitch,
    roll: view.roll,
    range: view.range,
    ...(isFiniteNumber(state.intrinsics.fov)
      ? {
          fovVertical: state.intrinsics
            .fov as ShareableViewState["fovVertical"],
        }
      : {}),
    ...(isFiniteNumber(state.intrinsics.fovHorizontal)
      ? {
          fovHorizontal: state.intrinsics
            .fovHorizontal as ShareableViewState["fovHorizontal"],
        }
      : {}),
    ...(isFiniteNumber(longerEdgeFov)
      ? { fovLongerEdge: longerEdgeFov as ShareableViewState["fovLongerEdge"] }
      : {}),
  };
};

export const applyToShareableHashValues = (
  viewState: ShareableViewState,
  options: ShareableViewStateAdapterOptions = {}
): ViewStateHashValues => {
  const defaultFovDeg = options.defaultFovDeg ?? DEFAULT_FOV_DEG;
  const zoomConvention =
    options.zoomConvention ?? HASH_ZOOM_CONVENTION.MAPLIBRE_512;
  const latitudeDeg = roundFixedNumber(
    radToDegNumeric(viewState.latitude),
    HASH_NUMBER_PRECISION.lat
  );
  const longitudeDeg = roundFixedNumber(
    radToDegNumeric(viewState.longitude),
    HASH_NUMBER_PRECISION.lng
  );
  const altitude = roundFixedNumber(
    viewState.altitude,
    HASH_NUMBER_PRECISION.distance
  );

  if (
    !isFiniteNumber(latitudeDeg) ||
    !isFiniteNumber(longitudeDeg) ||
    !isFiniteNumber(altitude)
  ) {
    return {};
  }

  const params: ViewStateHashValues = {
    lng: longitudeDeg,
    lat: latitudeDeg,
    altitude,
  };

  const verticalFovDeg = readVerticalFovDegFromShareableViewState(
    viewState,
    defaultFovDeg
  );
  const longerEdgeFovDeg =
    readLongerEdgeFovDegFromShareableViewState(viewState);
  const projectedZoom = isFiniteNumber(viewState.zoom)
    ? viewState.zoom
    : (() => {
        if (
          !isFiniteNumber(viewState.range) ||
          !isFiniteNumber(verticalFovDeg) ||
          !isWithinWebMercatorLat(latitudeDeg)
        ) {
          return undefined;
        }

        const metersPerCssPixel = readMetersPerCssPixel({
          rangeM: viewState.range,
          fovRad: degToRadNumeric(verticalFovDeg)!,
        });
        return isFiniteNumber(metersPerCssPixel)
          ? getZoomFromPixelResolutionAtLatitudeRad(
              metersPerCssPixel as Meters,
              viewState.latitude,
              { tileSize: MAPLIBRE_TILE_SIZE_PX }
            )
          : undefined;
      })();

  if (isFiniteNumber(projectedZoom) && isWithinWebMercatorLat(latitudeDeg)) {
    const hashZoom = roundFixedNumber(
      formatCanonicalZoomForHash(projectedZoom, zoomConvention),
      HASH_NUMBER_PRECISION.zoom
    );
    if (isFiniteNumber(hashZoom)) {
      params.zoom = hashZoom;
    }
  } else if (isFiniteNumber(viewState.range)) {
    const roundedRange = roundFixedNumber(
      viewState.range,
      HASH_NUMBER_PRECISION.distance
    );
    if (isFiniteNumber(roundedRange)) {
      params.range = roundedRange;
    }
  }

  const bearingDeg = readBearingDegFromShareableViewState(viewState.bearing);
  if (
    isFiniteNumber(bearingDeg) &&
    !isWrappedBearingCloseToZeroRad(viewState.bearing)
  ) {
    const roundedBearing = roundFixedNumber(
      bearingDeg,
      HASH_NUMBER_PRECISION.angle
    );
    if (isFiniteNumber(roundedBearing)) {
      params.bearing = roundedBearing;
    }
  }

  const pitchDeg = roundFixedNumber(
    clamp(radToDegNumeric(viewState.pitch), 0, DEFAULT_MAX_PITCH_DEG),
    HASH_NUMBER_PRECISION.angle
  );
  if (!isHashPitchCloseToZeroDeg(pitchDeg)) {
    params.pitch = pitchDeg;
  }

  if (!isWrappedRollCloseToZeroRad(viewState.roll)) {
    const roundedRoll = roundFixedNumber(
      radToDegNumeric(viewState.roll),
      HASH_NUMBER_PRECISION.angle
    );
    if (isFiniteNumber(roundedRoll)) {
      params.roll = roundedRoll;
    }
  }

  const roundedLongerEdgeFov = roundFixedNumber(
    longerEdgeFovDeg,
    HASH_NUMBER_PRECISION.angle
  );
  const hasNonDefaultLongerEdgeFov =
    isFiniteNumber(roundedLongerEdgeFov) &&
    !isZeroish(roundedLongerEdgeFov - defaultFovDeg);

  return hasNonDefaultLongerEdgeFov
    ? { ...params, fov: roundedLongerEdgeFov }
    : params;
};

export const readFromShareableHashValues = (
  hashValues: Record<string, unknown>,
  options: ShareableViewStateAdapterOptions = {}
): ShareableViewState | null => {
  const defaultFovDeg = options.defaultFovDeg ?? DEFAULT_FOV_DEG;
  const zoomConvention =
    options.zoomConvention ?? HASH_ZOOM_CONVENTION.MAPLIBRE_512;
  const lng = readViewStateHashNumber(hashValues.lng);
  const lat = readViewStateHashNumber(hashValues.lat);
  const altitude = readViewStateHashNumber(hashValues.altitude);

  if (
    !isFiniteNumber(lng) ||
    !isFiniteNumber(lat) ||
    !isFiniteNumber(altitude)
  ) {
    return null;
  }

  const hashLongerEdgeFovDeg = readViewStateHashNumber(hashValues.fov);
  const hashZoom = readViewStateHashNumber(hashValues.zoom);
  const zoom = isFiniteNumber(hashZoom)
    ? normalizeHashZoomToCanonical(hashZoom, zoomConvention)
    : undefined;
  const range = readViewStateHashNumber(hashValues.range);
  const bearing = readViewStateHashNumber(hashValues.bearing);
  const pitch = readViewStateHashNumber(hashValues.pitch);
  const roll = readViewStateHashNumber(hashValues.roll);

  const buildShareable = ({
    latitudeDeg,
    rangeM,
    includeZoom,
  }: {
    latitudeDeg: number;
    rangeM: number;
    includeZoom: boolean;
  }): ShareableViewState => ({
    longitude: degToRadNumeric(lng)! as ShareableViewState["longitude"],
    latitude: degToRadNumeric(latitudeDeg)! as ShareableViewState["latitude"],
    altitude: altitude as ShareableViewState["altitude"],
    ...(includeZoom && isFiniteNumber(zoom) ? { zoom } : {}),
    bearing: isFiniteNumber(bearing)
      ? (zeroToTwoPi(
          degToRadNumeric(bearing)! as ShareableViewState["bearing"]
        ) as ShareableViewState["bearing"])
      : (degToRadNumeric(0)! as ShareableViewState["bearing"]),
    pitch: isFiniteNumber(pitch)
      ? (degToRadNumeric(
          clamp(pitch, 0, DEFAULT_MAX_PITCH_DEG)
        )! as ShareableViewState["pitch"])
      : (degToRadNumeric(0)! as ShareableViewState["pitch"]),
    ...(isFiniteNumber(roll)
      ? {
          roll: degToRadNumeric(roll)! as ShareableViewState["roll"],
        }
      : {}),
    range: rangeM as ShareableViewState["range"],
    ...(isFiniteNumber(hashLongerEdgeFovDeg)
      ? {
          fovLongerEdge: degToRadNumeric(
            hashLongerEdgeFovDeg
          )! as ShareableViewState["fovLongerEdge"],
        }
      : {}),
  });

  if (isFiniteNumber(zoom)) {
    const latitudeDeg = clampWebMercatorLatitudeDeg(lat);
    const latitudeRad = degToRadNumeric(latitudeDeg)! as Radians;
    const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latitudeRad,
      { tileSize: MAPLIBRE_TILE_SIZE_PX }
    );
    const rangeM = readRangeFromMetersPerCssPixel({
      metersPerCssPixel,
      fovRad: degToRadNumeric(hashLongerEdgeFovDeg ?? defaultFovDeg)!,
      minRangeM: DEFAULT_MIN_RANGE_M,
    });

    if (isFiniteNumber(rangeM)) {
      return buildShareable({
        latitudeDeg,
        rangeM,
        includeZoom: true,
      });
    }
  }

  if (!isFiniteNumber(range)) {
    return null;
  }

  return buildShareable({
    latitudeDeg: lat,
    rangeM: Math.max(range, DEFAULT_MIN_RANGE_M),
    includeZoom: isFiniteNumber(zoom),
  });
};

export const readFromShareableViewState = (
  viewState: ShareableViewState,
  options?: ShareableViewStateAdapterOptions
): ViewState =>
  buildViewState({
    longitude: viewState.longitude,
    latitude: viewState.latitude,
    altitude: viewState.altitude,
    bearing: viewState.bearing,
    pitch: viewState.pitch,
    ...(isFiniteNumber(viewState.roll) ? { roll: viewState.roll } : {}),
    range: viewState.range,
    intrinsics: toCameraIntrinsics(viewState, options),
    metadata: {
      frameId: 0,
      timestampMs: Date.now(),
      sourceId: options?.sourceId ?? DEFAULT_SHAREABLE_VIEW_STATE_SOURCE_ID,
      source: options?.source ?? VIEW_STATE_SOURCE.RESTORE,
      ...((isFiniteNumber(viewState.zoom) || isFiniteNumber(viewState.fovLongerEdge))
        ? {
            restoreHints: {
              shareable: {
                ...(isFiniteNumber(viewState.zoom)
                  ? { zoom: viewState.zoom }
                  : {}),
                ...(isFiniteNumber(viewState.fovLongerEdge)
                  ? { fovLongerEdge: viewState.fovLongerEdge }
                  : {}),
              },
            },
          }
        : {}),
    },
  });

export const resolveViewStateRestoreHintsForViewport = (
  state: ViewState,
  options: {
    viewportWidthPx: number;
    viewportHeightPx: number;
  }
): ViewState => {
  const restoreHints = state.metadata.restoreHints?.shareable;
  const { viewportWidthPx, viewportHeightPx } = options;

  if (
    !restoreHints ||
    !isFiniteNumber(viewportWidthPx) ||
    viewportWidthPx <= 0 ||
    !isFiniteNumber(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return state;
  }

  const aspect = viewportWidthPx / viewportHeightPx;
  const shareableLongerEdgeFov =
    restoreHints.fovLongerEdge ??
    readLongerEdgeFovFromIntrinsics(state.intrinsics, {
      viewportWidthPx,
      viewportHeightPx,
    });
  const resolvedVerticalFov = readVerticalFovFromLongerEdge(
    shareableLongerEdgeFov,
    aspect
  );
  const resolvedHorizontalFov = readHorizontalFovFromVertical(
    resolvedVerticalFov,
    aspect
  );
  const view = deriveView(state);
  const resolvedRange = isFiniteNumber(restoreHints.zoom) &&
    isFiniteNumber(shareableLongerEdgeFov)
      ? readRangeFromMetersPerCssPixel({
          metersPerCssPixel: getPixelResolutionFromZoomAtLatitudeRad(
            restoreHints.zoom,
            state.anchorCartographic.latitude,
            { tileSize: MAPLIBRE_TILE_SIZE_PX }
          ),
          fovRad: shareableLongerEdgeFov,
          viewportWidthPx,
          viewportHeightPx,
        })
      : null;

  return buildViewState({
    longitude: view.longitude,
    latitude: view.latitude,
    altitude: view.altitude,
    bearing: view.bearing,
    pitch: view.pitch,
    roll: view.roll,
    range: (resolvedRange ?? view.range) as Meters,
    intrinsics: {
      ...state.intrinsics,
      ...(isFiniteNumber(resolvedVerticalFov)
        ? { fov: resolvedVerticalFov as CameraIntrinsics["fov"] }
        : {}),
      ...(isFiniteNumber(resolvedHorizontalFov)
        ? {
            fovHorizontal:
              resolvedHorizontalFov as CameraIntrinsics["fovHorizontal"],
          }
        : {}),
    },
    metadata: state.metadata,
  });
};
