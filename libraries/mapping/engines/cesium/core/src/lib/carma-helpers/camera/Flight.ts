import { Easing } from "@carma-commons/math";
import { shortestAngleDelta } from "@carma-commons/math";
import type { Radians } from "@carma-units";

import {
  BoundingSphere,
  Camera,
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  type Scene,
  CesiumMath,
} from "@carma-cesium";
import { writePerspectiveFrustumVerticalFov } from "./perspective-frustum-fov";
import type { CameraStateRecord } from "./Types";
// Reusable scratch objects for flyToTarget.
const scratchBoundingSphere = new BoundingSphere();
const scratchHeadingPitchRange = new HeadingPitchRange();
const DEFAULT_ORBIT_DURATION_MS = 500;

export type OrbitHeadingPitchRangeAnimationOptions = {
  durationMs?: number;
  easing?: (time: number) => number;
  onComplete?: () => void;
  onCancel?: () => void;
};

export type FlyCameraStateToSceneOptions = {
  duration?: number;
  applyFov?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
};

/**
 * Fly camera to target position with HeadingPitchRange orientation.
 */
export const flyToTarget = (
  camera: Camera,
  target: Cartesian3,
  hpr: { heading: number; pitch: number; range: number },
  duration?: number
): void => {
  scratchBoundingSphere.center = target;
  scratchBoundingSphere.radius = 0;

  scratchHeadingPitchRange.heading = hpr.heading;
  scratchHeadingPitchRange.pitch = hpr.pitch;
  scratchHeadingPitchRange.range = hpr.range;

  const options: {
    offset: HeadingPitchRange;
    duration?: number;
  } = {
    offset: scratchHeadingPitchRange,
  };

  if (duration !== undefined) {
    options.duration = duration;
  }

  camera.flyToBoundingSphere(scratchBoundingSphere, options);
};

export const animateOrbitHeadingPitchRange = (
  scene: Scene,
  center: Cartesian3,
  target: {
    heading: Radians;
    pitch: Radians;
    range: number;
  },
  {
    durationMs = DEFAULT_ORBIT_DURATION_MS,
    easing = Easing.SINUSOIDAL_IN_OUT,
    onComplete,
    onCancel,
  }: OrbitHeadingPitchRangeAnimationOptions = {}
): (() => void) => {
  const camera = scene.camera;
  if (!camera || scene.isDestroyed()) {
    return () => undefined;
  }

  const startHeading = camera.heading as Radians;
  const startPitch = camera.pitch as Radians;
  const startRange = Cartesian3.distance(center, camera.position);
  const headingDelta = shortestAngleDelta(
    startHeading,
    target.heading
  ) as Radians;
  const pitchDelta = (target.pitch - startPitch) as Radians;
  const rangeDelta = target.range - startRange;

  if (
    Math.abs(headingDelta) < 1e-6 &&
    Math.abs(pitchDelta) < 1e-6 &&
    Math.abs(rangeDelta) < 1e-3
  ) {
    return () => undefined;
  }

  let cancelled = false;
  const startTime = performance.now();

  const applyLookAtState = (
    heading: Radians,
    pitch: Radians,
    range: number
  ) => {
    camera.lookAt(center, new HeadingPitchRange(heading, pitch, range));

    try {
      camera.lookAtTransform(Matrix4.IDENTITY);
    } catch {
      // Ignore transient teardown races.
    }
  };

  const stop = (invokeCancel: boolean) => {
    if (scene.isDestroyed()) {
      return;
    }
    scene.preRender.removeEventListener(onPreRender);

    try {
      camera.lookAtTransform(Matrix4.IDENTITY);
    } catch {
      // Ignore transient teardown races.
    }

    scene.requestRender();
    if (invokeCancel) {
      onCancel?.();
    }
  };

  const finish = () => {
    if (scene.isDestroyed()) {
      return;
    }

    applyLookAtState(target.heading, target.pitch, target.range);
    scene.preRender.removeEventListener(onPreRender);
    scene.requestRender();
    onComplete?.();
  };

  const onPreRender = () => {
    if (cancelled || scene.isDestroyed()) {
      stop(true);
      return;
    }

    const elapsedMs = performance.now() - startTime;
    const rawT = durationMs <= 0 ? 1 : Math.min(elapsedMs / durationMs, 1);
    const t = CesiumMath.clamp(easing(rawT), 0, 1);

    const nextHeading = (startHeading + headingDelta * t) as Radians;
    const nextPitch = (startPitch + pitchDelta * t) as Radians;
    const nextRange = startRange + rangeDelta * t;

    applyLookAtState(nextHeading, nextPitch, nextRange);
    scene.requestRender();

    if (rawT >= 1) {
      finish();
    }
  };

  scene.preRender.addEventListener(onPreRender);
  scene.requestRender();

  return () => {
    cancelled = true;
    stop(true);
  };
};

export const flyToCameraState = (
  scene: Scene,
  state: CameraStateRecord,
  options: FlyCameraStateToSceneOptions = {}
): boolean => {
  const camera = scene.camera;
  if (!camera) {
    return false;
  }

  camera.lookAtTransform(Matrix4.IDENTITY);
  camera.flyTo({
    destination: state.position,
    orientation: {
      direction: state.direction,
      up: state.up,
    },
    duration: options.duration,
    complete: options.onComplete,
    cancel: options.onCancel,
  });

  if (
    options.applyFov !== false &&
    state.fov !== undefined &&
    camera.frustum instanceof PerspectiveFrustum
  ) {
    writePerspectiveFrustumVerticalFov(camera.frustum, state.fov);
  }

  scene.requestRender();
  return true;
};
