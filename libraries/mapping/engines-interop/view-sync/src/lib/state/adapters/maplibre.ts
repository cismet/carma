import { isFiniteNumber, clamp } from "@carma/math";
import type { CssPixels, Radians } from "@carma/units/types";
import {
  degToRadNumeric,
  radToDegNumeric,
  negativePiToPi,
} from "@carma/units/helpers";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  clampLatitudeToWebMercatorExtent,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
} from "@carma/geo/utils";
import {
  isMapViewEqualToTarget,
  readMapLibrePerspectiveIntrinsics,
  readMapLibreViewOffsetFromCanvas,
} from "@carma-mapping/engines/maplibre-gl/utils";
import {
  CAMERA_TYPE,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import type { Map as MapLibreMap } from "maplibre-gl";
import { readRangeFromMetersPerCssPixel } from "../../adapters/sharedProjection";
import {
  buildCommonViewState,
  type AngleBasedViewInput,
} from "../core/construct";
import { deriveOrbitAngles, deriveZoom } from "../core/derivations";
import type { CommonViewState, ViewStateMetadata } from "../core/types";

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
  map: MapLibreMap,
  sourceId: string,
  options?: {
    altitudeM?: number;
    fovDeg?: number;
    seedState?: CommonViewState | null;
  }
): CommonViewState | null => {
  const center = map.getCenter();
  if (!isFiniteNumber(center.lng) || !isFiniteNumber(center.lat)) return null;

  const zoom = map.getZoom();
  if (!isFiniteNumber(zoom)) return null;

  const seedState = options?.seedState ?? null;
  const bearingDeg = map.getBearing();
  const pitchDeg = map.getPitch();
  const altitudeM =
    options?.altitudeM ??
    (seedState?.anchorCartographic.altitude as number | undefined) ??
    DEFAULT_ALTITUDE_M;
  const runtimeIntrinsics = readMapLibrePerspectiveIntrinsics(map);
  const fovRad =
    runtimeIntrinsics.fov ??
    seedState?.intrinsics.fov ??
    degToRadNumeric(options?.fovDeg ?? DEFAULT_FOV_DEG)!;
  const viewOffset =
    runtimeIntrinsics.viewOffset ??
    readMapLibreViewOffsetFromCanvas(map.getCanvas?.());

  const latRad = clampLatitudeToWebMercatorExtent(
    degToRadNumeric(center.lat)! as Radians
  );
  const lonRad = degToRadNumeric(center.lng)! as Radians;

  const metersPerPx = getPixelResolutionFromZoomAtLatitudeRad(zoom, latRad, {
    tileSize: MAPLIBRE_TILE_SIZE_PX,
  });
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel: metersPerPx,
    fovRad,
    minRangeM: MIN_RANGE_M,
    viewportWidthPx: viewOffset?.width as number | undefined,
    viewportHeightPx: viewOffset?.height as number | undefined,
  });
  if (!isFiniteNumber(rangeM)) return null;

  const pitchRad = degToRadNumeric(clamp(pitchDeg, 0, MAX_PITCH_DEG))!;
  const bearingRad = degToRadNumeric(bearingDeg)!;

  const intrinsics: CameraIntrinsics = seedState
    ? {
        ...seedState.intrinsics,
        ...runtimeIntrinsics,
        type: seedState.intrinsics.type ?? runtimeIntrinsics.type,
        fov: fovRad as Radians,
        ...(viewOffset ? { viewOffset } : {}),
      }
    : {
        ...runtimeIntrinsics,
        type: runtimeIntrinsics.type ?? CAMERA_TYPE.PERSPECTIVE,
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
  map: MapLibreMap,
  state: CommonViewState
): void => {
  const { bearing, pitch } = deriveOrbitAngles(state);
  const canvas = map.getCanvas?.();
  const zoom = deriveZoom(state, canvas?.clientWidth, canvas?.clientHeight);
  const carto = state.anchorCartographic;

  const lngDeg = radToDegNumeric(carto.longitude as number);
  const latDeg = radToDegNumeric(carto.latitude as number);

  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(zoom)
  ) {
    return;
  }

  const clampedLatDeg = clamp(
    latDeg,
    -WEB_MERCATOR_MAX_LATITUDE_DEG,
    WEB_MERCATOR_MAX_LATITUDE_DEG
  );

  const bearingDeg = radToDegNumeric(bearing as number);
  const pitchDeg = clamp(radToDegNumeric(pitch as number), 0, MAX_PITCH_DEG);

  if (
    isMapViewEqualToTarget(map, {
      center: [lngDeg, clampedLatDeg],
      zoom,
      bearing: bearingDeg,
      pitch: pitchDeg,
    })
  ) {
    return;
  }

  map.jumpTo({
    center: [lngDeg, clampedLatDeg],
    zoom,
    bearing: bearingDeg,
    pitch: pitchDeg,
  });
};
