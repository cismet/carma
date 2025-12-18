import { clampToToleranceRange } from "@carma-commons/utils";
import { Easing } from "@carma-commons/math";
import {
  Cartesian3,
  Cartographic,
  CesiumMath,
  defined,
  type Scene,
} from "@carma/cesium";

export const OBLIQUE_PITCH_TOLERANCE = CesiumMath.toRadians(10);
export const OBLIQUE_HEIGHT_TOLERANCE = 150.0;

export interface CameraForceObliqueOptions {
  fixedPitch: number;
  fixedHeight: number;
  pitchTolerance?: number;
  heightTolerance?: number;
}

export const isInRange = (
  value: number,
  target: number,
  tolerance: number
): boolean => Math.abs(value - target) <= tolerance;

export const testCameraObliqueCompliant = (
  camera: { pitch: number; positionCartographic?: { height: number } | null },
  options: CameraForceObliqueOptions
): boolean => {
  const {
    fixedPitch,
    fixedHeight,
    pitchTolerance = OBLIQUE_PITCH_TOLERANCE,
    heightTolerance = OBLIQUE_HEIGHT_TOLERANCE,
  } = options;
  const height = camera.positionCartographic?.height ?? 0;
  return (
    isInRange(camera.pitch, fixedPitch, pitchTolerance) &&
    isInRange(height, fixedHeight, heightTolerance)
  );
};

export const isCameraObliqueCompliant = testCameraObliqueCompliant;

let animState: {
  startHeight: number;
  targetHeight: number;
  duration: number;
  startTime: number;
} | null = null;

export const cesiumCameraForceOblique = (
  scene: Scene,
  options: CameraForceObliqueOptions
) => {
  if (!scene || !scene.globe || !scene.camera) {
    return;
  }
  const {
    fixedPitch,
    fixedHeight,
    pitchTolerance = OBLIQUE_PITCH_TOLERANCE,
    heightTolerance = OBLIQUE_HEIGHT_TOLERANCE,
  } = options;
  const currentPosition = scene.camera.position;
  const currentCartographic = Cartographic.fromCartesian(currentPosition);
  if (!currentCartographic || !defined(currentCartographic)) {
    return;
  }

  const currentPitch = scene.camera.pitch;
  const currentHeight = currentCartographic.height;

  // Bail out early if height is invalid (can happen before scene is fully initialized)
  if (!Number.isFinite(currentHeight)) {
    console.warn("Invalid height, skipping camera correction", currentHeight);
    return;
  }

  const [targetPitch, pitchNeedsCorrection] = clampToToleranceRange(
    currentPitch,
    fixedPitch,
    pitchTolerance
  );

  const [targetHeight, heightNeedsCorrection] = clampToToleranceRange(
    currentHeight,
    fixedHeight,
    heightTolerance
  );

  // Only apply corrections if needed
  if (heightNeedsCorrection || pitchNeedsCorrection) {
    const now = performance.now();
    let anim = animState;

    const dynamicDuration = Math.min(
      Math.sqrt(Math.abs(currentHeight - targetHeight)) * 60,
      2000
    );

    if (!anim || anim.targetHeight !== targetHeight) {
      anim = {
        startHeight: currentHeight,
        targetHeight,
        duration: dynamicDuration, // ms
        startTime: now,
      };
      animState = anim;
    }
    const elapsed = now - anim.startTime;
    const t = Math.min(1, elapsed / anim.duration);
    const easedT = Easing.CUBIC_IN_OUT(t);
    const nextHeight =
      anim.startHeight + (anim.targetHeight - anim.startHeight) * easedT;
    // Move along the camera's view direction (zoom ray) using trigonometry
    const cameraDir = scene.camera.direction;
    const cameraPos = scene.camera.position;
    const pitchSin = Math.sin(scene.camera.pitch);
    if (Math.abs(pitchSin) > 1e-3) {
      try {
        let zoomTravelDistance = (currentHeight - nextHeight) / pitchSin;

        if (
          isNaN(zoomTravelDistance) ||
          !Number.isFinite(zoomTravelDistance) ||
          isNaN(nextHeight)
        ) {
          console.warn(
            "Invalid travel distance calculated, resetting to 0",
            zoomTravelDistance,
            currentHeight,
            nextHeight,
            pitchSin
          );
          if (isNaN(nextHeight)) {
            // If nextHeight is NaN, something upstream is wrong (likely targetHeight/fixedHeight)
            // We can't do anything meaningful.
            animState = null;
            return;
          }
          // Fallback for other calculation errors
          zoomTravelDistance = 0;
        } else {
          // Negate because sin(-pitch) is negative, but we want positive movement along the forward vector to go down
          zoomTravelDistance = -zoomTravelDistance;
        }

        // warn to track possible positioning errors;
        if (Math.abs(zoomTravelDistance) > 50000) {
          console.warn("Travel distance too large", zoomTravelDistance);
        }

        const newPos = Cartesian3.add(
          cameraPos,
          Cartesian3.multiplyByScalar(
            cameraDir,
            zoomTravelDistance,
            new Cartesian3()
          ),
          new Cartesian3()
        );
        scene.camera.position = newPos;
        defined(newPos) &&
          scene.camera.setView({
            destination: newPos,
            orientation: {
              heading: scene.camera.heading,
              pitch: targetPitch,
              roll: 0,
            },
          });
      } catch (error) {
        console.warn("Error setting camera position:", error);
      }
    }
    if (t === 1) {
      animState = null;
    }
    return;
  }
  // Always clear the state if no correction is needed
  animState = null;
};
