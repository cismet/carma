import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  Viewer,
  Math as CesiumMath,
  Cartesian2,
} from "cesium";
import { AnimationType, ViewerAnimationMap } from "./viewerAnimationMap";

// TODO: consolidate cesium animation helper into separate package
// see also viewerAnimationMap

export enum PITCH {
  HORIZONTAL = 0,
  OBLIQUE = CesiumMath.toRadians(-45),
  ORTHO = CesiumMath.toRadians(-90),
}

/**
 * Get the point on the globe that the camera is currently orbiting around.
 * @param viewer The Cesium viewer.
 * @returns The point on the globe that the camera is currently orbiting around.
 */
export const getOrbitPoint = (viewer: Viewer) => {
  const scene = viewer.scene;
  const screenCenter = new Cartesian2(
    scene.canvas.clientWidth / 2,
    scene.canvas.clientHeight / 2
  );
  const ray = scene.camera.getPickRay(screenCenter);
  if (!ray) {
    return null;
  }
  const target = scene.globe.pick(ray, scene);
  return target;
};

function runAnimation(
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap,
  target: Cartesian3,
  targetHeading: number,
  targetPitch: number,
  initialRange: number,
  duration: number,
  animationType: AnimationType
) {
  const startTime = performance.now();
  const startHeading = viewer.scene.camera.heading || 0;
  const startPitch = viewer.scene.camera.pitch || 0;

  const animate = (time: number) => {
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1);
    const easeInOutQuad = t * (2 - t);

    let headingDifference = targetHeading - startHeading;
    if (headingDifference > Math.PI) headingDifference -= 2 * Math.PI;
    if (headingDifference < -Math.PI) headingDifference += 2 * Math.PI;

    const currentHeading = startHeading + headingDifference * easeInOutQuad;
    const currentPitch =
      startPitch + (targetPitch - startPitch) * easeInOutQuad;

    viewer.scene.camera.lookAt(
      target,
      new HeadingPitchRange(currentHeading, currentPitch, initialRange)
    );

    if (t < 1) {
      const animationFrameId = requestAnimationFrame(animate);
      viewerAnimationMap.set(viewer, {
        id: animationFrameId,
        type: animationType,
        cancelable: true,
      });
    } else {
      viewer.scene.camera.lookAtTransform(Matrix4.IDENTITY);
      viewerAnimationMap.delete(viewer); // Clear the animation entry
    }
  };
  animate(performance.now());
}

/**
 * Animate the camera to a new position.
 * @param viewer The Cesium viewer.
 * @param viewerAnimationMap A WeakMap to store animation frame IDs.
 * @param target The target position.
 * @param targetHeading The target heading.
 * @param targetPitch The target pitch.
 * @param initialRange The initial range.
 * @param duration The animation duration.
 * @param animationType The type of animation.
 */
export const animateCamera = (
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap,
  target: Cartesian3,
  targetHeading: number,
  targetPitch: number,
  initialRange: number,
  duration: number,
  animationType: AnimationType = AnimationType.ResetView
) => {
  const previousAnimation = viewerAnimationMap.get(viewer);
  if (previousAnimation) {
    if (previousAnimation.cancelable) {
      console.info(`Canceling previous ${previousAnimation.type} animation`);
      cancelAnimationFrame(previousAnimation.id);
      viewer.scene.camera.lookAtTransform(Matrix4.IDENTITY);
      runAnimation(
        viewer,
        viewerAnimationMap,
        target,
        targetHeading,
        targetPitch,
        initialRange,
        duration,
        animationType
      );
    } else {
      console.info(
        `Scheduling ${animationType} animation after ${previousAnimation.type}`
      );
      setTimeout(() => {
        runAnimation(
          viewer,
          viewerAnimationMap,
          target,
          targetHeading,
          targetPitch,
          initialRange,
          duration,
          animationType
        );
      }, duration);
    }
  } else {
    runAnimation(
      viewer,
      viewerAnimationMap,
      target,
      targetHeading,
      targetPitch,
      initialRange,
      duration,
      animationType
    );
  }
};

// TODO: figure out this bug
// when pitch is at -Math.PI / 2 the HeadingPitchRange heading resets to 0;
const OFFSET_NADIR = -Math.PI / 2 + 0.0001;

/**
 * Get the heading and pitch for a mouse event.
 * @param event The mouse event.
 * @param initialMouseX The initial mouse X position.
 * @param initialMouseY The initial mouse Y position.
 * @param initialHeading The initial heading.
 * @param initialPitch The initial pitch.
 * @param headingFactor The heading factor.
 * @param pitchFactor The pitch factor.
 * @param minPitch The minimum pitch.
 * @param maxPitch The maximum pitch.
 * @returns The heading and pitch for the mouse event.
 */
export const getHeadingPitchForMouseEvent = (
  event: MouseEvent,
  initialMouseX: number,
  initialMouseY: number,
  initialHeading: number,
  initialPitch: number,
  headingFactor: number,
  pitchFactor: number,
  minPitch: number,
  maxPitch: number
) => {
  const absoluteMinPitch = Math.max(minPitch, OFFSET_NADIR);
  const absoluteMaxPitch = Math.min(maxPitch, 0);
  const deltaX = event.clientX - initialMouseX;
  const deltaY = event.clientY - initialMouseY;
  const headingChange = (deltaX * 0.01 * headingFactor) % CesiumMath.TWO_PI;
  const newHeading = (initialHeading + headingChange) % CesiumMath.TWO_PI;
  // default pitch direction is same as maplibre
  let pitchChange = -deltaY * 0.01 * pitchFactor;

  const newPitchRaw = (initialPitch + pitchChange) % CesiumMath.TWO_PI;
  const newPitch = CesiumMath.clamp(
    newPitchRaw,
    absoluteMinPitch,
    absoluteMaxPitch
  );
  return { heading: newHeading, pitch: newPitch };
};
