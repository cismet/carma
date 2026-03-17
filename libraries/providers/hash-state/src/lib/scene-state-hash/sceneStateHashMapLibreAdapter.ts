import {
  distanceFromMercatorZoomAtLatitudeDeg,
  mercatorZoomFromDistanceAtLatitudeDeg,
} from "@carma/geo/utils";
import type { Degrees, Meters, Radians } from "@carma/units/types";
import {
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  type MapLibrePlusElevationHashValues,
  type SceneStateHashSnapshot,
} from "./sceneStateHashTypes";
import {
  clamp,
  degToRadNumeric,
  isFiniteNumber,
  isZeroish,
  radToDegNumeric,
  zeroToThreeSixty,
} from "./sceneStateHashHelpers";

export type SceneStateHashMapLibreAdapterOptions = {
  defaultFovDeg?: number;
  minPitchDeg?: number;
  maxPitchDeg?: number;
  minLineOfSightDistanceM?: number;
  minDecodedObjectCentricRangeM?: number;
};

const DEFAULT_MIN_LINE_OF_SIGHT_DISTANCE_M = 0.01;
const DEFAULT_MIN_DECODED_OBJECT_CENTRIC_RANGE_M = 10;

const resolveMapLibreAdapterOptions = (
  options?: SceneStateHashMapLibreAdapterOptions
): Required<SceneStateHashMapLibreAdapterOptions> => ({
  defaultFovDeg: options?.defaultFovDeg ?? DEFAULT_MAPLIBRE_FOV_DEG,
  minPitchDeg: options?.minPitchDeg ?? DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg: options?.maxPitchDeg ?? DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  minLineOfSightDistanceM:
    options?.minLineOfSightDistanceM ?? DEFAULT_MIN_LINE_OF_SIGHT_DISTANCE_M,
  minDecodedObjectCentricRangeM:
    options?.minDecodedObjectCentricRangeM ??
    DEFAULT_MIN_DECODED_OBJECT_CENTRIC_RANGE_M,
});

export const toMapLibrePitchDeg = (
  scenePitchDeg: number,
  options?: Pick<
    SceneStateHashMapLibreAdapterOptions,
    "minPitchDeg" | "maxPitchDeg"
  >
): number => {
  const { minPitchDeg, maxPitchDeg } = resolveMapLibreAdapterOptions(options);
  return clamp(90 + scenePitchDeg, minPitchDeg, maxPitchDeg);
};

export const fromMapLibrePitchDeg = (
  pitchDeg: number,
  options?: Pick<
    SceneStateHashMapLibreAdapterOptions,
    "minPitchDeg" | "maxPitchDeg"
  >
): number => {
  const { minPitchDeg, maxPitchDeg } = resolveMapLibreAdapterOptions(options);
  return clamp(pitchDeg, minPitchDeg, maxPitchDeg) - 90;
};

export const readObjectCentricRangeFromMapLibreZoom = ({
  zoom,
  latitudeDeg,
  fovDeg,
  viewportWidthPx,
  viewportHeightPx,
  options,
}: {
  zoom: number;
  latitudeDeg: number;
  fovDeg?: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  options?: SceneStateHashMapLibreAdapterOptions;
}): number | undefined => {
  const { defaultFovDeg, minLineOfSightDistanceM } =
    resolveMapLibreAdapterOptions(options);
  const effectiveFovDeg = fovDeg ?? defaultFovDeg;

  if (
    !isFiniteNumber(zoom) ||
    !isFiniteNumber(latitudeDeg) ||
    !isFiniteNumber(viewportWidthPx) ||
    !isFiniteNumber(viewportHeightPx)
  ) {
    return undefined;
  }

  const fovRad = degToRadNumeric(effectiveFovDeg)!;
  const rangeM = distanceFromMercatorZoomAtLatitudeDeg(
    zoom,
    latitudeDeg as never,
    {
      fovVerticalRad: fovRad as Radians,
      viewportWidthPx,
      viewportHeightPx,
    }
  );

  if (!isFiniteNumber(rangeM)) {
    return undefined;
  }

  return Math.max(rangeM, minLineOfSightDistanceM);
};

export const readMapLibrePlusElevationHashValuesFromSceneState = ({
  snapshot,
  viewportWidthPx,
  viewportHeightPx,
  options,
}: {
  snapshot: SceneStateHashSnapshot;
  viewportWidthPx: number;
  viewportHeightPx: number;
  options?: SceneStateHashMapLibreAdapterOptions;
}): MapLibrePlusElevationHashValues | null => {
  const { defaultFovDeg, minPitchDeg, maxPitchDeg } =
    resolveMapLibreAdapterOptions(options);
  const rangeM = snapshot.orientation.rangeM;
  if (!isFiniteNumber(rangeM)) {
    return null;
  }

  const fovRad = snapshot.orientation.fovVerticalRad;
  const fovDeg =
    isFiniteNumber(fovRad) && fovRad > 0
      ? radToDegNumeric(fovRad)!
      : defaultFovDeg;

  const zoom = mercatorZoomFromDistanceAtLatitudeDeg(
    rangeM as Meters,
    snapshot.anchor.latDeg as never,
    {
      fovVerticalRad: degToRadNumeric(fovDeg)! as Radians,
      viewportWidthPx,
      viewportHeightPx,
    }
  );

  if (!isFiniteNumber(zoom)) {
    return null;
  }

  const pitchDeg = isFiniteNumber(snapshot.orientation.pitchRad)
    ? radToDegNumeric(snapshot.orientation.pitchRad)!
    : undefined;
  const mapLibrePitchDeg = isFiniteNumber(pitchDeg)
    ? toMapLibrePitchDeg(pitchDeg, { minPitchDeg, maxPitchDeg })
    : undefined;

  const params: MapLibrePlusElevationHashValues = {
    lng: snapshot.anchor.lngDeg,
    lat: snapshot.anchor.latDeg,
    zoom,
    altitude: snapshot.anchor.heightM,
  };

  const bearingDeg = isFiniteNumber(snapshot.orientation.bearingRad)
    ? (zeroToThreeSixty(
        radToDegNumeric(snapshot.orientation.bearingRad)! as Degrees
      ) as number)
    : undefined;
  if (!isZeroish(bearingDeg)) {
    params.bearing = bearingDeg;
  }

  if (!isZeroish(mapLibrePitchDeg)) {
    params.pitch = mapLibrePitchDeg;
  }

  if (isFiniteNumber(fovRad) && Math.abs(fovDeg - defaultFovDeg) > 1e-9) {
    params.fov = fovDeg;
  }

  return params;
};

export const readSceneStateFromMapLibrePlusElevationHashValues = ({
  values,
  viewportWidthPx,
  viewportHeightPx,
  options,
}: {
  values: Partial<MapLibrePlusElevationHashValues>;
  viewportWidthPx: number;
  viewportHeightPx: number;
  options?: SceneStateHashMapLibreAdapterOptions;
}): SceneStateHashSnapshot | null => {
  const {
    defaultFovDeg,
    minPitchDeg,
    maxPitchDeg,
    minDecodedObjectCentricRangeM,
  } = resolveMapLibreAdapterOptions(options);
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
    isFiniteNumber(values.fov) && values.fov > 0 ? values.fov : defaultFovDeg;
  const rangeM = readObjectCentricRangeFromMapLibreZoom({
    zoom,
    latitudeDeg: lat,
    fovDeg,
    viewportWidthPx,
    viewportHeightPx,
    options,
  });
  const pitchDeg = fromMapLibrePitchDeg(
    isFiniteNumber(values.pitch) ? values.pitch : minPitchDeg,
    { minPitchDeg, maxPitchDeg }
  );

  let restoredRangeM = rangeM;
  if (
    isFiniteNumber(restoredRangeM) &&
    restoredRangeM < minDecodedObjectCentricRangeM
  ) {
    console.warn(
      "[hash-state] Clamping zoom-decoded scene restore range to minimum distance.",
      {
        decodedRangeM: restoredRangeM,
        restoredRangeM: minDecodedObjectCentricRangeM,
        zoom,
        latitudeDeg: lat,
        fovDeg,
      }
    );
    restoredRangeM = minDecodedObjectCentricRangeM;
  }

  return {
    anchor: {
      lngDeg: lng,
      latDeg: lat,
      heightM: altitude,
    },
    orientation: {
      ...(isFiniteNumber(values.bearing)
        ? {
            bearingRad: degToRadNumeric(
              zeroToThreeSixty(values.bearing as Degrees) as number
            )!,
          }
        : {}),
      ...(isFiniteNumber(pitchDeg)
        ? { pitchRad: degToRadNumeric(pitchDeg)! }
        : {}),
      ...(isFiniteNumber(restoredRangeM) ? { rangeM: restoredRangeM } : {}),
      ...(isFiniteNumber(values.fov)
        ? { fovVerticalRad: degToRadNumeric(values.fov)! }
        : {}),
    },
  };
};
