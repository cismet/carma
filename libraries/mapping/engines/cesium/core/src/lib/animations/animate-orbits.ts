import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  Math as CesiumMath,
  Cartesian2,
  type Scene,
} from "cesium";

import type { Radians } from "@carma/units/types";
import type { AnimationType } from "@carma/types";
import { AnimationTypes } from "@carma/types";

import { AnimationMap } from "./animation-map";
import {
  isValidScene,
  tryWithValidCamera,
  tryWithValidScene,
} from "@carma-mapping/engines/cesium/api";

// TODO: consolidate cesium animation helper into separate package
// see also animationMap

export enum PITCH {
  HORIZONTAL = 0 as Radians,
  OBLIQUE = CesiumMath.toRadians(-45) as Radians,
  ORTHO = CesiumMath.toRadians(-90) as Radians,
}

/**
 * Get the point on the globe that the camera is currently orbiting around.
 * @param scene The Cesium scene.
 * @returns The point on the globe that the camera is currently orbiting around.
 */
export const getOrbitPoint = (scene: Scene): Cartesian3 | undefined => {
  let target: Cartesian3 | undefined = undefined;

  tryWithValidScene(scene, (scene) => {
    const screenCenter = new Cartesian2(
      scene.canvas.clientWidth / 2,
      scene.canvas.clientHeight / 2
    );
    const ray = scene.camera.getPickRay(screenCenter);
    if (!ray) {
      return;
    }
    target = scene.globe.pick(ray, scene);
  });
  return target;
};

function runAnimation(
  scene: Scene,
  animationMap: AnimationMap,
  target: Cartesian3,
  targetHeading: number,
  targetPitch: number,
  initialRange: number,
  duration: number,
  animationType: AnimationType
) {
  if (!isValidScene(scene)) {
    console.error("runAnimation failed: no scene");
    return;
  }
  const { camera } = scene;
  const startTime = performance.now();
  const startHeading = camera.heading || 0;
  const startPitch = camera.pitch || 0;

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

    const hpr = new HeadingPitchRange(
      currentHeading,
      currentPitch,
      initialRange
    );

    tryWithValidCamera(camera, (camera) => {
      camera.lookAt(target, hpr);
    });

    if (t < 1) {
      const animationFrameId = requestAnimationFrame(animate);
      animationMap.set(scene, {
        id: animationFrameId,
        type: animationType,
        cancelable: true,
      });
    } else {
      tryWithValidCamera(camera, (camera) => {
        camera.lookAtTransform(Matrix4.IDENTITY);
      });
      animationMap.delete(scene); // Clear the animation entry
    }
  };
  animate(performance.now());
}

/**
 * Animate the camera to a new position.
 * @param scene The Cesium scene.
 * @param animationMap A WeakMap to store animation frame IDs.
 * @param target The target position.
 * @param targetHeading The target heading.
 * @param targetPitch The target pitch.
 * @param initialRange The initial range.
 * @param duration The animation duration.
 * @param animationType The type of animation.
 */
export const animateCamera = (
  scene: Scene,
  animationMap: AnimationMap,
  target: Cartesian3,
  targetHeading: number,
  targetPitch: number,
  initialRange: number,
  duration: number,
  animationType: AnimationType = AnimationTypes.ResetView
) => {
  const previousAnimation = animationMap.get(scene);

  if (!isValidScene(scene)) {
    console.error("animateCamera failed: no scene");
    return;
  }

  const { camera } = scene;

  if (previousAnimation) {
    if (previousAnimation.cancelable) {
      console.info(`Canceling previous ${previousAnimation.type} animation`);
      cancelAnimationFrame(previousAnimation.id);

      tryWithValidCamera(camera, (camera) => {
        camera.lookAtTransform(Matrix4.IDENTITY);
      });
      runAnimation(
        scene,
        animationMap,
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
          scene,
          animationMap,
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
      scene,
      animationMap,
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
): { heading: Radians; pitch: Radians } => {
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
  return { heading: newHeading as Radians, pitch: newPitch as Radians };
};
