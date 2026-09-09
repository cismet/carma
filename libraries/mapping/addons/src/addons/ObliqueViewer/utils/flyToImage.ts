import type { Map as MaplibreMap } from "maplibre-gl";

import { Easing } from "@carma-commons/math";
import type { Altitude, Coordinates } from "@carma-geo/data-structures";
import { ellipsoidalToDhhn2016Height } from "@carma-geo/proj";

import type {
  AnimationConfig,
  ObliqueDataset,
  ObliqueHeightDatum,
  ObliqueImageRecord,
  ObliquePose,
} from "../types";
import { degToRad, dynamicDurationMs, groundDistanceM } from "./cameraMath";
import { computePose } from "./exteriorOrientation";
import { whenMoveEnds, type CameraFlight } from "./obliqueCamera";

/**
 * The flight to an image: the camera to the perspective centre, looking
 * the way the image was shot.
 *
 * MapLibre places a camera by centre, zoom, bearing and pitch, and works
 * the centre out from the camera on a plane at the centre's elevation.
 * With the centre clamped to the ground that elevation follows the terrain
 * tiles as they arrive, and the camera with it. The flight therefore takes
 * the centre off the ground for its duration and the preview's, so the
 * pose stays what was asked for; the viewer puts it back on the way out.
 */

/** the flight strips were flown in UTM zone 32 */
const UTM_ZONE = 32;

/** metres of camera error a landed flight is allowed before a corrective jump */
const CAMERA_TOLERANCE_M = 0.5;
const ANGLE_TOLERANCE_DEG = 0.05;
const MAX_CORRECTIONS = 3;

/** the pose of a record, computed on first use and kept on the record */
export const poseOf = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset
): ObliquePose => {
  if (!record.pose) {
    record.pose = computePose(
      record,
      [record.centerWGS84[0], record.centerWGS84[1]],
      dataset.cameraIdToUpVector[record.cameraId]
    );
  }
  return record.pose;
};

/**
 * The altitude the camera flies to: the served z, in the terrain's frame.
 * A dataset whose z is ellipsoidal is brought down by the geoid undulation
 * first; the offset is for fine tuning against a building edge.
 */
export const resolveCameraAltitude = async (
  record: ObliqueImageRecord,
  heightDatum: ObliqueHeightDatum,
  heightOffset: number
): Promise<number> => {
  if (heightDatum === "ellipsoidal") {
    const coordinate = {
      east: record.x,
      north: record.y,
      zone: UTM_ZONE,
    } as unknown as Coordinates.ETRS89UTM;
    const height = await ellipsoidalToDhhn2016Height(
      coordinate,
      record.z as unknown as Altitude.EllipsoidalWGS84Meters
    );
    return Number(height) + heightOffset;
  }
  return record.z + heightOffset;
};

const angleDifferenceDeg = (a: number, b: number): number => {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
};

/** how far the camera is from where it should stand, metres */
const cameraErrorM = (
  map: MaplibreMap,
  pose: ObliquePose,
  altitude: number
): number => {
  const camera = map.transform.getCameraLngLat();
  return Math.hypot(
    groundDistanceM(camera, { lng: pose.longitude, lat: pose.latitude }),
    map.transform.getCameraAltitude() - altitude
  );
};

/**
 * Fly the camera to a pose. `dynamicDuration` derives the duration from the
 * distance, capped at the animation's own; a sibling hop is short, a flight
 * across town is not.
 */
export const flyToPose = (
  map: MaplibreMap,
  pose: ObliquePose,
  altitude: number,
  animation: AnimationConfig | undefined,
  { dynamicDuration = true }: { dynamicDuration?: boolean } = {}
): CameraFlight => {
  const cameraOptions = () =>
    map.calculateCameraOptionsFromCameraLngLatAltRotation(
      [pose.longitude, pose.latitude],
      altitude,
      pose.bearingDeg,
      pose.pitchDeg
    );

  const maxDuration = animation?.duration ?? 2000;
  const duration = dynamicDuration
    ? dynamicDurationMs(cameraErrorM(map, pose, altitude), maxDuration)
    : maxDuration;
  const easing = animation?.easingFunction ?? Easing.LINEAR_NONE;

  map.setCenterClampedToGround(false);
  map.easeTo({ ...cameraOptions(), duration, easing, essential: true });

  const done = whenMoveEnds(map, duration).then(() => {
    // an ease the user interrupted, or one the terrain moved under, lands
    // off the pose; a jump from where the camera is now settles it
    for (let attempt = 0; attempt < MAX_CORRECTIONS; attempt++) {
      const positionOk = cameraErrorM(map, pose, altitude) < CAMERA_TOLERANCE_M;
      const anglesOk =
        angleDifferenceDeg(map.getBearing(), pose.bearingDeg) < ANGLE_TOLERANCE_DEG &&
        Math.abs(map.getPitch() - pose.pitchDeg) < ANGLE_TOLERANCE_DEG;
      if (positionOk && anglesOk) break;
      map.jumpTo(cameraOptions(), { obliqueFov: true });
    }
  });

  return { done, cancel: () => map.stop() };
};

/**
 * Put the centre back on the ground without moving the camera: the centre
 * and zoom are re-solved for the terrain under the current view first, so
 * clamping finds nothing to correct.
 */
export const restoreCenterOnGround = (map: MaplibreMap): void => {
  const terrain = map.terrain;
  if (terrain) {
    map.transform.recalculateZoomAndCenter(terrain);
  }
  map.setCenterClampedToGround(true);
  map.jumpTo(
    {
      center: map.getCenter(),
      zoom: map.getZoom(),
      elevation: map.getCenterElevation(),
    },
    { obliqueFov: true }
  );
};

/** ease the tilt back to the browsing pitch, for the pitch lock to take */
export const settleToPitch = (
  map: MaplibreMap,
  pitchDeg: number,
  durationMs = 300
): CameraFlight => {
  map.easeTo({
    pitch: pitchDeg,
    duration: durationMs,
    easing: Easing.QUADRATIC_IN_OUT,
    essential: true,
  });
  return { done: whenMoveEnds(map, durationMs), cancel: () => map.stop() };
};

/** the sector's strip heading in radians, for a search in that direction */
export const stripHeadingRad = (
  direction: number,
  headingOffsetDeg: number
): number => direction * (Math.PI / 2) + degToRad(headingOffsetDeg);
