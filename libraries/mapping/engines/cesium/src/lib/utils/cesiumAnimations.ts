import {
  Viewer,
  Cartesian3,
  Matrix4,
  Math as CesiumMath,
  HeadingPitchRange,
  EasingFunction,
  Scene,
  PerspectiveFrustum,
} from "cesium";

// Common helpers for Cesium camera animations
const PITCH_MIN = -Math.PI / 2 + 0.0001; // avoid singularity at exact nadir
const PITCH_MAX = 0; // do not go above horizon

function shortestAngleLerp(start: number, end: number, t: number): number {
  const delta = CesiumMath.negativePiToPi(end - start);
  return start + delta * t;
}

function shortestPitchClamped(
  startPitch: number,
  targetPitch: number,
  t: number
): number {
  const pitchTargetAdjusted =
    startPitch + CesiumMath.negativePiToPi(targetPitch - startPitch);
  const rawPitch = CesiumMath.lerp(startPitch, pitchTargetAdjusted, t);
  return CesiumMath.clamp(rawPitch, PITCH_MIN, PITCH_MAX);
}

function setupPointerCancel(
  viewer: Viewer,
  cancelable: boolean,
  cancel: () => void
): () => void {
  const onPointer = () => {
    if (cancelable) cancel();
  };
  viewer.canvas.addEventListener("pointerdown", onPointer);
  return () => viewer.canvas.removeEventListener("pointerdown", onPointer);
}

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

  // get HPR from camera in relation to LookAt in order to interpolate to target HPR

  let initialHeading = viewer.camera.heading;
  const initialPitch = viewer.camera.pitch;
  const initialRange = Cartesian3.distance(viewer.camera.position, destination);

  setPrevious &&
    setPrevious({
      heading: initialHeading,
      pitch: initialPitch,
      range: initialRange,
    });

  // Animation control variables
  let animationFrameId: number | null = null;
  let isCanceled = false;

  // Animation start time
  const startTime = performance.now() + delay; // delay the animation for other animations to finish

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
    const t = Math.min(elapsed / duration, 1); // normalize to [0, 1]
    //console.debug('animate', duration, elapsed, t, frameIndex);

    // Interpolate heading and pitch over time
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

    // Update the camera's orientation
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.camera.lookAt(destination, orientation);
    // explicit render call due to cesium request render mode.
    viewer.scene.render();

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      // Animation complete, reset the transformation matrix
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      removePointerCancel();
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  return cancelAnimation;
}

/**
 * Interpolate PerspectiveFrustum fov with easing and pointer-cancel.
 */
export function animateInterpolateFov(
  viewer: Viewer,
  targetFov: number,
  {
    delay = 0,
    duration = 300,
    easing = EasingFunction.SINUSOIDAL_IN_OUT,
    cancelable = true,
    onComplete,
    onCancel,
  }: {
    delay?: number;
    duration?: number;
    easing?: (t: number) => number;
    cancelable?: boolean;
    onComplete?: () => void;
    onCancel?: () => void;
  } = {}
): () => void {
  return animateInterpolateCameraPositionOrientation(viewer, {
    delay,
    duration,
    easing,
    cancelable,
    onComplete,
    onCancel,
    fov: targetFov,
  });
}

// undocumented cesium function to get if animation is running
// https://community.cesium.com/t/cancel-a-camera-flyto-intentionally/1371/6
export const cesiumSceneHasTweens = (viewer: Viewer) => {
  const scene = viewer.scene as Scene & { tweens: [] };
  return scene && scene.tweens && scene.tweens.length > 0;
};

/**
 * Interpolates Cesium camera position and orientation directly (setView) with easing.
 * Intended for driving camera to an absolute position/orientation rather than orbiting a target.
 * @param viewer - Cesium viewer
 * @param options - animation options, including optional destination/orientation
 * @param options.destination - final camera Cartesian3 position (optional)
 * @param options.orientation - target orientation (heading/pitch/roll). If not provided, current values are kept.
 * @returns cancel function
 */
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
  } = {}
): () => void {
  // Capture initial state
  const initialPos = viewer.camera.position.clone();
  const startHeading = viewer.camera.heading;
  const startPitch = viewer.camera.pitch;
  const startRoll = viewer.camera.roll;

  const dest = destination ?? initialPos;
  const ori = orientation ?? {};
  const targetHeading = ori.heading ?? startHeading;
  const targetPitch = ori.pitch ?? startPitch;
  const targetRoll = ori.roll ?? startRoll;

  // Determine which components actually need interpolation
  const hasPerspectiveFrustum =
    viewer.camera.frustum instanceof PerspectiveFrustum;
  const startFov: number | undefined =
    hasPerspectiveFrustum && typeof fov === "number"
      ? (viewer.camera.frustum as PerspectiveFrustum).fov
      : undefined;

  const posNeeds = !Cartesian3.equalsEpsilon(
    initialPos,
    dest,
    CesiumMath.EPSILON7,
    CesiumMath.EPSILON7
  );
  const headingNeeds =
    typeof targetHeading === "number" &&
    Math.abs(CesiumMath.negativePiToPi(targetHeading - startHeading)) >
      CesiumMath.EPSILON7;
  const pitchNeeds =
    typeof targetPitch === "number" &&
    Math.abs(CesiumMath.negativePiToPi(targetPitch - startPitch)) >
      CesiumMath.EPSILON7;
  const rollNeeds =
    typeof targetRoll === "number" &&
    Math.abs(targetRoll - startRoll) > CesiumMath.EPSILON7;
  const fovNeeds =
    typeof fov === "number" &&
    typeof startFov === "number" &&
    Math.abs(fov - startFov) > CesiumMath.EPSILON7;

  if (!posNeeds && !headingNeeds && !pitchNeeds && !rollNeeds && !fovNeeds) {
    onComplete?.();
    return () => {};
  }

  // Animation control variables
  let animationFrameId: number | null = null;
  let isCanceled = false;

  const startTime = performance.now() + delay;

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
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1);
    const te = easing(t);

    // Interpolate position in Cartesian space (only if needed)
    const currentPos = posNeeds
      ? new Cartesian3(
          CesiumMath.lerp(initialPos.x, dest.x, te),
          CesiumMath.lerp(initialPos.y, dest.y, te),
          CesiumMath.lerp(initialPos.z, dest.z, te)
        )
      : initialPos;

    // Interpolate orientation
    const currentHeading = headingNeeds
      ? shortestAngleLerp(startHeading, targetHeading, te)
      : startHeading;
    const currentPitch = pitchNeeds
      ? shortestPitchClamped(startPitch, targetPitch, te)
      : startPitch;
    const currentRoll = rollNeeds
      ? CesiumMath.lerp(startRoll, targetRoll, te)
      : startRoll;

    // Apply view
    if (posNeeds || headingNeeds || pitchNeeds || rollNeeds) {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      viewer.camera.setView({
        destination: currentPos,
        orientation: {
          heading: currentHeading,
          pitch: currentPitch,
          roll: currentRoll,
        },
      });
    }

    // Interpolate FOV within the same loop if requested
    if (fovNeeds && hasPerspectiveFrustum && typeof startFov === "number") {
      (viewer.camera.frustum as PerspectiveFrustum).fov = CesiumMath.lerp(
        startFov,
        fov as number,
        te
      );
    }
    // Explicit render due to requestRenderMode
    viewer.scene.render();

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      removePointerCancel();
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  return cancelAnimation;
}
