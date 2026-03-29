import { isFiniteNumber, clamp } from "@carma/math";
import type { Radians } from "@carma/units/types";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  clampLatitudeToWebMercatorExtent,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
} from "@carma/geo/utils";
import {
  isMapViewEqualToTarget,
  readMapLibrePerspectiveIntrinsics,
} from "@carma-mapping/engines/maplibre-gl/utils";
import {
  CAMERA_TYPE,
  readRangeFromMetersPerCssPixel,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import type { Map as MapLibreMap } from "maplibre-gl";
import { buildViewState, type AngleBasedViewInput } from "../core/construct";
import { deriveOrbitAngles, deriveZoom } from "../core/derivations";
import type { ViewState, ViewStateMetadata } from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FOV_DEG = 36.87;
const DEFAULT_ALTITUDE_M = 0;
const MAPLIBRE_TILE_SIZE_PX = 512;
const MIN_RANGE_M = 0.01;
const MAX_PITCH_DEG = 85;

// ---------------------------------------------------------------------------
// Read: MapLibre map → ViewState
// ---------------------------------------------------------------------------

export const readFromMaplibre = (
  map: MapLibreMap,
  sourceId: string,
  options?: {
    altitudeM?: number;
    fovDeg?: number;
    seedState?: ViewState | null;
  }
): ViewState | null => {
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
  const canvas = map.getCanvas?.();
  const viewportWidthPx =
    typeof canvas?.clientWidth === "number" &&
    isFiniteNumber(canvas.clientWidth) &&
    canvas.clientWidth > 0
      ? canvas.clientWidth
      : undefined;
  const viewportHeightPx =
    typeof canvas?.clientHeight === "number" &&
    isFiniteNumber(canvas.clientHeight) &&
    canvas.clientHeight > 0
      ? canvas.clientHeight
      : undefined;
  const runtimeIntrinsics = readMapLibrePerspectiveIntrinsics(map);
  const fovRad =
    runtimeIntrinsics.fov ??
    seedState?.intrinsics.fov ??
    degToRadNumeric(options?.fovDeg ?? DEFAULT_FOV_DEG)!;

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
    viewportWidthPx,
    viewportHeightPx,
  });
  if (!isFiniteNumber(rangeM)) return null;

  const pitchRad = degToRadNumeric(clamp(pitchDeg, 0, MAX_PITCH_DEG))!;
  const bearingRad = degToRadNumeric(bearingDeg)!;

  const intrinsics: CameraIntrinsics = seedState
    ? (() => {
        const {
          type: _ignoredType,
          fov: _ignoredFov,
          fovHorizontal: _ignoredFovHorizontal,
          viewOffset: _ignoredViewOffset,
          orthographicScale: _ignoredOrthographicScale,
          ...seedIntrinsics
        } = seedState.intrinsics;
        return {
          ...seedIntrinsics,
          ...runtimeIntrinsics,
          type: runtimeIntrinsics.type ?? CAMERA_TYPE.PERSPECTIVE,
          fov: fovRad as Radians,
        };
      })()
    : {
        ...runtimeIntrinsics,
        type: runtimeIntrinsics.type ?? CAMERA_TYPE.PERSPECTIVE,
        fov: fovRad as Radians,
      };

  const metadata: ViewStateMetadata = {
    frameId: 0,
    timestampMs: Date.now(),
    sourceId,
    source: "user-interaction",
    ...(viewportWidthPx && viewportHeightPx
      ? {
          viewport: {
            widthPx: viewportWidthPx,
            heightPx: viewportHeightPx,
          },
        }
      : {}),
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

  return buildViewState(input);
};

// ---------------------------------------------------------------------------
// Apply: ViewState → MapLibre map
// ---------------------------------------------------------------------------

export const applyToMaplibre = (map: MapLibreMap, state: ViewState): void => {
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
  const target = {
    center: [lngDeg, clampedLatDeg] as [number, number],
    zoom,
    bearing: bearingDeg,
    pitch: pitchDeg,
  };

  if (isMapViewEqualToTarget(map, target)) {
    return;
  }

  map.jumpTo(target);
};
