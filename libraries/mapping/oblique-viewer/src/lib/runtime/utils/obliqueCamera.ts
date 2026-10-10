import { degToRadNumeric as degToRad, type Degrees } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";

import { Easing } from "@carma-commons/math";
import {
  easeMapLibreCameraWithFov,
  setCameraRestrictionOverride,
} from "@carma-mapping/engines/maplibre";

import type { AnimationConfig, ObliqueDataset } from "../../core/types";
import {
  tween,
  capObliqueAnimationDuration,
  zoomForCameraDistance,
  type TweenHandle,
} from "./cameraMath";

/**
 * The camera moves the viewer makes on the MapLibre map, as plain functions
 * over the map: tilting in, tilting out, turning to a sector, and the pitch
 * lock that holds the browsing tilt in between.
 *
 * The map's own field of view is animated alongside the eases, which
 * MapLibre has no option for; every fov write fires its own move events, so
 * they carry a marker and the flight-end detection skips them.
 */

/** the owner the viewer holds its camera-restriction override under */
export const OBLIQUE_RESTRICTION_OWNER = "obliqueViewer";

/** what a flight to an image may need; MapLibre allows up to 180 */
export const FREE_MAX_PITCH_DEG = 85;

/** attached to the move events the viewer's own fov writes fire */
const OBLIQUE_FOV_EVENT = { obliqueFov: true };

export const setFov = (map: MaplibreMap, fovDeg: number): void => {
  map.setVerticalFieldOfView(fovDeg, OBLIQUE_FOV_EVENT);
};

/**
 * Hold the map at the browsing tilt. The maximum goes through the override
 * so a later settle of the restriction store keeps it; the minimum is the
 * map's own, which the store never touches. Max before min: MapLibre
 * refuses a minimum above the maximum.
 */
export const lockPitch = (map: MaplibreMap, pitchDeg: number): void => {
  setCameraRestrictionOverride(
    map,
    { restricted: false, maxPitch: pitchDeg },
    OBLIQUE_RESTRICTION_OWNER
  );
  map.setMinPitch(pitchDeg);
};

/** let a flight take any tilt an image was shot at */
export const freePitch = (map: MaplibreMap): void => {
  map.setMinPitch(0);
  setCameraRestrictionOverride(
    map,
    { restricted: false, maxPitch: FREE_MAX_PITCH_DEG },
    OBLIQUE_RESTRICTION_OWNER
  );
};

/** hand the camera back to whoever restricted it before */
export const releaseCamera = (map: MaplibreMap): void => {
  map.setMinPitch(0);
  // a flight takes the centre off the ground; whatever state the viewer
  // leaves in, the map gets its centre back on it
  map.setCenterClampedToGround(true);
  setCameraRestrictionOverride(map, null, OBLIQUE_RESTRICTION_OWNER);
};

/**
 * Resolves when the running ease ends. The viewer's own fov writes fire
 * `moveend` as well and are skipped; a timeout a little past the ease's
 * duration guards against an ease that never reports back.
 */
export const whenMoveEnds = (
  map: MaplibreMap,
  durationMs: number
): Promise<void> =>
  new Promise((resolve) => {
    let timeoutId: number | undefined;
    const handler = (event: { obliqueFov?: boolean }) => {
      if (event.obliqueFov) return;
      map.off("moveend", handler);
      window.clearTimeout(timeoutId);
      resolve();
    };
    map.on("moveend", handler);
    timeoutId = window.setTimeout(() => {
      map.off("moveend", handler);
      resolve();
    }, durationMs + 500);
  });

export type CameraFlight = {
  /** settles when the flight is over, cancelled or not */
  done: Promise<void>;
  /** stop the fov tween and the ease where they are */
  cancel: () => void;
};

const resolveAnimation = (
  config: AnimationConfig | undefined,
  fallbackDurationMs: number
) => ({
  duration: capObliqueAnimationDuration(config?.duration ?? fallbackDurationMs),
  easing: config?.easingFunction ?? Easing.LINEAR_NONE,
});

/** whether the terrain is on; switched on from the given source if it is there */
export const ensureTerrain = (map: MaplibreMap, sourceId: string): boolean => {
  if (map.getTerrain()) return false;
  if (!map.getSource(sourceId)) {
    console.warn(
      `[OBLIQUE] terrain source "${sourceId}" is not in the style; the preview will not line up with the ground`
    );
    return false;
  }
  const elevation = map.transform.elevation;
  map.setTerrain({ source: sourceId, exaggeration: 1 });
  // setTerrain immediately snaps the target onto the DEM. Keep the current
  // view here; the following native ease interpolates to the ground elevation.
  map.transform.setElevation(elevation);
  return true;
};

/**
 * Tilt in: pitch to the browsing tilt, use the requested entry heading or
 * retain the current continuous bearing,
 * pull the camera to its browsing height above the centre and narrow the
 * fov, all in one move around the centre.
 */
export const enterObliqueView = (
  map: MaplibreMap,
  dataset: ObliqueDataset,
  entryBearingDeg?: Degrees
): CameraFlight => {
  const { duration, easing } = resolveAnimation(
    dataset.animations.enterObliqueMode,
    2000
  );
  const center = map.getCenter();
  const targetFov = dataset.enterFovDeg;
  const pitch = dataset.pitchDeg;
  const distanceM = dataset.cameraHeightAboveCenter / Math.cos(degToRad(pitch));
  const zoom = zoomForCameraDistance(
    distanceM,
    map.transform.height,
    targetFov,
    center.lat
  );
  const bearing =
    entryBearingDeg !== undefined && Number.isFinite(entryBearingDeg)
      ? entryBearingDeg
      : map.getBearing();

  return easeMapLibreCameraWithFov(
    map,
    {
      pitch,
      zoom,
      bearing,
      duration,
      easing,
      essential: true,
    },
    targetFov
  );
};

/** tilt out: back to flat and north-up, and the fov the map had before */
export const leaveObliqueView = (
  map: MaplibreMap,
  dataset: ObliqueDataset,
  restoreFovDeg: number,
  maxDurationMs = 1100
): CameraFlight => {
  const { duration, easing } = resolveAnimation(
    {
      ...dataset.animations.leaveObliqueMode,
      duration: Math.min(
        dataset.animations.leaveObliqueMode?.duration ?? 1100,
        maxDurationMs
      ),
    },
    1100
  );
  return easeMapLibreCameraWithFov(
    map,
    {
      pitch: 0,
      bearing: 0,
      duration,
      easing,
      essential: true,
    },
    restoreFovDeg
  );
};

/** turn around the centre to a bearing */
export const turnTo = (
  map: MaplibreMap,
  bearingDeg: number,
  animation: AnimationConfig | undefined
): CameraFlight => {
  const { duration, easing } = resolveAnimation(animation, 1800);
  map.easeTo({ bearing: bearingDeg, duration, easing, essential: true });
  return {
    done: whenMoveEnds(map, duration),
    cancel: () => map.stop(),
  };
};

/** a tween of the map's fov alone, for the wheel zoom */
export const tweenFov = (
  map: MaplibreMap,
  toFovDeg: number,
  durationMs: number,
  onFrame: (fovDeg: number) => void,
  onComplete?: () => void
): TweenHandle =>
  tween({
    from: map.getVerticalFieldOfView(),
    to: toFovDeg,
    durationMs: capObliqueAnimationDuration(durationMs),
    easing: Easing.CUBIC_OUT,
    onUpdate: onFrame,
    onComplete,
  });
