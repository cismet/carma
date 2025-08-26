import {
  Viewer,
  Cartesian3,
  Matrix4,
  Math as CesiumMath,
  HeadingPitchRange,
  EasingFunction,
  PerspectiveFrustum,
  Quaternion,
  HeadingPitchRoll,
} from "cesium";

import { computeAlphaDamped, computeAlphaTimed } from "./easing";
import {
  shortestAngleLerp,
  quatNeedsUpdate,
  posNeedsUpdate,
  fovNeedsUpdate,
  lerpCartesian3,
  setCameraViewFromQuat,
  shortestPitchClamped,
  setupPointerCancel,
} from "./helpers";

/**
 * Rotates and tilts the Cesium camera around the center of the screen.
 * @param viewer - The Cesium viewer instance.
 * @param destination - The position to look at.
 * @param hpr - the target heading, pitch, and range of the camera.
 * @param options - Options for the completion of the animation.
 * @param options.duration - The duration of the animation in milliseconds. Defaults to 1000.
 * @param options.cancelable - If true, the animation can be canceled by user interaction. Defaults to true.
 * @param options.easing - The easing function to use for the animation. Defaults to EasingFunction.CUBIC_IN_OUT.
 * @param options.onCancel - A callback function to be called when the animation is canceled.
 * @param options.onComplete - A callback function to be called when the animation completes.
 * @param options.setPrevious - A callback function to be called with the initial heading, pitch, and range of the camera.
 * @param options.useCurrentDistance - use current Distance/Range instead of last views one.
 */
export function animateInterpolateHeadingPitchRange(
  viewer: Viewer,
  destination: Cartesian3,
  hpr: HeadingPitchRange = new HeadingPitchRange(0, -Math.PI / 2, 0),
  {
    delay = 0,
    duration = 1000,
    onComplete,
    onCancel,
    cancelable = true,
    useCurrentDistance = true,
    easing = EasingFunction.CUBIC_IN_OUT,
    setPrevious,
  }: {
    setPrevious?: (hpr: HeadingPitchRange) => void;
    duration?: number;
    delay?: number; // ms
    onComplete?: () => void;
    cancelable?: boolean;
    onCancel?: () => void;
    useCurrentDistance?: boolean;
    easing?: (time: number) => number;
  } = {}
): () => void {
  const { heading, pitch, range } = hpr;

  let initialHeading = viewer.camera.heading;
  const initialPitch = viewer.camera.pitch;
  const initialRange = Cartesian3.distance(viewer.camera.position, destination);

  setPrevious &&
    setPrevious({
      heading: initialHeading,
      pitch: initialPitch,
      range: initialRange,
    });
  let animationFrameId: number | null = null;
  let isCanceled = false;

  let startTime = performance.now() + delay;

  const cancelAnimation = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      isCanceled = true;
      removePointerCancel();
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      onCancel?.();
    }
  };

  const removePointerCancel = setupPointerCancel(
    viewer,
    cancelable,
    cancelAnimation
  );

  const animate = (time: number) => {
    if (isCanceled) return;
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1);
    const te = easing(t);
    const currentHeading = shortestAngleLerp(initialHeading, heading, te);
    const currentPitch = shortestPitchClamped(initialPitch, pitch, te);
    const currentRange = CesiumMath.clamp(
      useCurrentDistance
        ? initialRange
        : CesiumMath.lerp(initialRange, range, te),
      10,
      40000
    );

    const orientation = new HeadingPitchRange(
      currentHeading,
      currentPitch,
      currentRange
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.camera.lookAt(destination, orientation);
    viewer.scene.render();

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      removePointerCancel();
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  return cancelAnimation;
}

/**
 * Interpolates Cesium camera position and orientation directly (setView) with easing.
 * Intended for driving camera to an absolute position/orientation rather than orbiting a target.
 * @param viewer - Cesium viewer
 * @param options - animation options, including optional destination/orientation
 * @param options.destination - final camera Cartesian3 position (optional)
 * @param options.orientation - target orientation (heading/pitch/roll). If not provided, current values are kept.
 * @returns controller with cancel and chainable to() for retargeting (optionally resetTiming)
 */
export type CameraInterpolationController = {
  cancel: () => void;
  to: (
    opts: {
      destination?: Cartesian3;
      orientation?: { heading?: number; pitch?: number; roll?: number };
      fov?: number;
    },
    cfg?: { resetTiming?: boolean }
  ) => CameraInterpolationController;
};

export function animateInterpolateCameraPositionOrientation(
  viewer: Viewer,
  {
    destination,
    orientation,
    delay = 0,
    duration = 1000,
    onComplete,
    onCancel,
    cancelable = true,
    easing = EasingFunction.CUBIC_IN_OUT,
    fov,
    mode = "damped",
    tauMs = 300,
  }: {
    destination?: Cartesian3;
    orientation?: { heading?: number; pitch?: number; roll?: number };
    delay?: number; // ms
    duration?: number; // ms
    onComplete?: () => void;
    onCancel?: () => void;
    cancelable?: boolean;
    easing?: (time: number) => number;
    fov?: number; // optional target FOV to animate within the same loop
    mode?: "damped" | "timed";
    tauMs?: number; // used for damped mode
  } = {}
): CameraInterpolationController {
  const initialPos = viewer.camera.position.clone();
  const startHeading = viewer.camera.heading;
  const startPitch = viewer.camera.pitch;
  const startRoll = viewer.camera.roll;

  let currentPos = initialPos.clone();
  let currentQuat = Quaternion.fromHeadingPitchRoll(
    new HeadingPitchRoll(startHeading, startPitch, startRoll)
  );

  let targetPos = destination ?? initialPos.clone();
  let targetQuat = (() => {
    const h = orientation?.heading ?? startHeading;
    const p = orientation?.pitch ?? startPitch;
    const r = orientation?.roll ?? startRoll;
    return Quaternion.fromHeadingPitchRoll(new HeadingPitchRoll(h, p, r));
  })();
  const hasPerspectiveFrustum =
    viewer.camera.frustum instanceof PerspectiveFrustum;
  let currentFov = hasPerspectiveFrustum
    ? (viewer.camera.frustum as PerspectiveFrustum).fov
    : undefined;
  let targetFov =
    hasPerspectiveFrustum && typeof fov === "number" ? fov : undefined;

  const needsAny = () => {
    const posNeeds = posNeedsUpdate(currentPos, targetPos);
    const quatNeeds = quatNeedsUpdate(currentQuat, targetQuat);
    const fovNeeds = fovNeedsUpdate(currentFov, targetFov);
    return posNeeds || quatNeeds || fovNeeds;
  };

  let animationFrameId: number | null = null;
  let isCanceled = false;
  let started = false;
  let lastTime = performance.now();
  let startTime = performance.now() + delay;

  const cancelAnimation = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      isCanceled = true;
      removePointerCancel();
      onCancel?.();
    }
  };

  const removePointerCancel = setupPointerCancel(
    viewer,
    cancelable,
    cancelAnimation
  );

  const animate = (time: number) => {
    if (isCanceled) return;
    if (!started) {
      started = true;
      lastTime = time;
    }

    if (time < startTime) {
      animationFrameId = requestAnimationFrame(animate);
      return;
    }

    const dt = Math.max(0, time - lastTime);
    lastTime = time;

    const alpha =
      mode === "damped"
        ? computeAlphaDamped(dt, tauMs)
        : computeAlphaTimed(time, startTime, duration, easing);

    currentQuat = Quaternion.slerp(currentQuat, targetQuat, alpha, currentQuat);
    currentPos = lerpCartesian3(currentPos, targetPos, alpha);
    if (typeof currentFov === "number" && typeof targetFov === "number") {
      currentFov = CesiumMath.lerp(currentFov, targetFov, alpha);
      (viewer.camera.frustum as PerspectiveFrustum).fov = currentFov;
    }
    setCameraViewFromQuat(viewer, currentPos, currentQuat);
    viewer.scene.render();
    if (mode === "timed") {
      const elapsed = time - startTime;
      if (elapsed >= Math.max(1, duration)) {
        removePointerCancel();
        onComplete?.();
        return;
      }
    } else {
      const closeEnough = !needsAny();
      if (closeEnough) {
        removePointerCancel();
        onComplete?.();
        return;
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  };

  animationFrameId = requestAnimationFrame(animate);

  const controller: CameraInterpolationController = {
    cancel: cancelAnimation,
    to: ({ destination, orientation, fov }, cfg) => {
      if (destination) {
        targetPos = destination;
      }
      if (orientation) {
        const h =
          orientation.heading ??
          HeadingPitchRoll.fromQuaternion(targetQuat).heading;
        const p =
          orientation.pitch ??
          HeadingPitchRoll.fromQuaternion(targetQuat).pitch;
        const r =
          orientation.roll ?? HeadingPitchRoll.fromQuaternion(targetQuat).roll;
        targetQuat = Quaternion.fromHeadingPitchRoll(
          new HeadingPitchRoll(h, p, r)
        );
      }
      if (typeof fov === "number") {
        targetFov = fov;
        if (typeof currentFov !== "number" && hasPerspectiveFrustum) {
          currentFov = (viewer.camera.frustum as PerspectiveFrustum).fov;
        }
      }
      if (cfg?.resetTiming) {
        startTime = performance.now();
      }
      return controller;
    },
  };

  return controller;
}
