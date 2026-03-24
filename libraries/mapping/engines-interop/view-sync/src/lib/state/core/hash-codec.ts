import { isFiniteNumber } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";
import {
  degToRadNumeric,
  radToDegNumeric,
  zeroToTwoPi,
  negativePiToPi,
} from "@carma/units/helpers";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
} from "@carma/geo/utils";
import type { CameraIntrinsics } from "@carma-commons/camera/model";
import {
  readMetersPerCssPixel,
  readRangeFromMetersPerCssPixel,
} from "../../adapters/sharedProjection";
import { deriveView } from "./derivations";
import { buildCommonViewState, type AngleBasedViewInput } from "./construct";
import type { CommonViewState, ViewStateMetadata } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FOV_DEG = 45;
const DEFAULT_MAX_PITCH_DEG = 85;
const MIN_RANGE_M = 0.01;
const MAPLIBRE_TILE_SIZE_PX = 512;
const ROLL_ZERO_EPSILON_DEG = 0.01;
const ROLL_ZERO_EPSILON_RAD = degToRadNumeric(ROLL_ZERO_EPSILON_DEG)!;

// ---------------------------------------------------------------------------
// Encode: CommonViewState → hash params (Record<string, number>)
// ---------------------------------------------------------------------------

export const encodeHashFromViewState = (
  state: CommonViewState,
  options?: { defaultFovDeg?: number }
): Record<string, number> => {
  const defaultFovDeg = options?.defaultFovDeg ?? DEFAULT_FOV_DEG;
  const view = deriveView(state);

  const latDeg = radToDegNumeric(view.latitude as number);
  const lngDeg = radToDegNumeric(view.longitude as number);
  const isWebMercator =
    isFiniteNumber(latDeg) && Math.abs(latDeg) <= WEB_MERCATOR_MAX_LATITUDE_DEG;

  const params: Record<string, number> = {
    lng: lngDeg,
    lat: latDeg,
    altitude: view.altitude as number,
  };

  if (isWebMercator && isFiniteNumber(view.zoom) && view.zoom > 0) {
    params.zoom = view.zoom;
  } else {
    params.range = view.range as number;
  }

  // Bearing (0-360 degrees)
  const bearingNorm = zeroToTwoPi(view.bearing) as number;
  const bearingDeg = radToDegNumeric(bearingNorm);
  if (isFiniteNumber(bearingDeg) && Math.abs(bearingDeg) > 0.01) {
    params.bearing =
      bearingNorm === 0 && (view.bearing as number) > 0 ? 360 : bearingDeg;
  }

  // Pitch
  const pitchDeg = radToDegNumeric(view.pitch as number);
  if (isFiniteNumber(pitchDeg) && pitchDeg > 0.01) {
    params.pitch = pitchDeg;
  }

  // Roll (only if non-trivial)
  const rollWrapped = negativePiToPi(view.roll) as number;
  if (Math.abs(rollWrapped) > ROLL_ZERO_EPSILON_RAD) {
    params.roll = radToDegNumeric(view.roll as number);
  }

  // FOV (only if non-default)
  const fovDeg = isFiniteNumber(view.fov)
    ? radToDegNumeric(view.fov as number)
    : undefined;
  if (isFiniteNumber(fovDeg) && Math.abs(fovDeg - defaultFovDeg) > 0.01) {
    params.fov = fovDeg;
  }

  return params;
};

// ---------------------------------------------------------------------------
// Decode: hash params → CommonViewState
// ---------------------------------------------------------------------------

const coerceNumber = (v: unknown): number | undefined => {
  if (isFiniteNumber(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return isFiniteNumber(n) ? n : undefined;
  }
  return undefined;
};

export const decodeHashToViewState = (
  values: Record<string, unknown>,
  options?: { defaultFovDeg?: number; maxPitchDeg?: number; sourceId?: string }
): CommonViewState | null => {
  const defaultFovDeg = options?.defaultFovDeg ?? DEFAULT_FOV_DEG;
  const maxPitchDeg = options?.maxPitchDeg ?? DEFAULT_MAX_PITCH_DEG;
  const sourceId = options?.sourceId ?? "hash";

  const lng = coerceNumber(values.lng);
  const lat = coerceNumber(values.lat);
  const altitude = coerceNumber(values.altitude);
  const zoom = coerceNumber(values.zoom);
  const range = coerceNumber(values.range);
  const bearing = coerceNumber(values.bearing);
  const pitch = coerceNumber(values.pitch);
  const roll = coerceNumber(values.roll);
  const fovDeg = coerceNumber(values.fov);

  if (
    !isFiniteNumber(lng) ||
    !isFiniteNumber(lat) ||
    !isFiniteNumber(altitude)
  ) {
    return null;
  }

  const lonRad = degToRadNumeric(lng)!;
  const latRad = degToRadNumeric(lat)!;
  const fovRad = degToRadNumeric(fovDeg ?? defaultFovDeg)!;

  // Determine range — either directly or from zoom
  let rangeM: number | null = null;

  if (isFiniteNumber(range)) {
    rangeM = range < MIN_RANGE_M ? MIN_RANGE_M : range;
  } else if (isFiniteNumber(zoom)) {
    const metersPerPx = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latRad as Radians,
      { tileSize: MAPLIBRE_TILE_SIZE_PX }
    );
    rangeM = readRangeFromMetersPerCssPixel({
      metersPerCssPixel: metersPerPx,
      fovRad,
      minRangeM: MIN_RANGE_M,
    });
  }

  if (!isFiniteNumber(rangeM)) return null;

  const bearingRad = isFiniteNumber(bearing)
    ? (zeroToTwoPi(degToRadNumeric(bearing)! as Radians) as number)
    : 0;
  const pitchRad = isFiniteNumber(pitch)
    ? degToRadNumeric(Math.min(Math.max(pitch, 0), maxPitchDeg))!
    : 0;
  const rollRad = isFiniteNumber(roll) ? degToRadNumeric(roll)! : undefined;

  const intrinsics: CameraIntrinsics = {
    fov: fovRad as Radians,
  };

  const metadata: ViewStateMetadata = {
    frameId: 0,
    timestampMs: Date.now(),
    sourceId,
    source: "hash",
  };

  const input: AngleBasedViewInput = {
    longitude: lonRad,
    latitude: latRad,
    altitude,
    bearing: bearingRad,
    pitch: pitchRad,
    roll: rollRad,
    range: rangeM,
    intrinsics,
    metadata,
  };

  return buildCommonViewState(input);
};
