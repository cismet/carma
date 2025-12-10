import { clampToToleranceRange } from "@carma-commons/utils";
import {
  Cartesian3,
  Math as CesiumMath,
  type Scene,
  EasingFunction,
  defined,
  Cartographic,
} from "cesium";

const PITCH_TOLERANCE_THRESHOLD = CesiumMath.toRadians(10);
const HEIGHT_TOLERANCE_THRESHOLD = 150.0;

interface CameraObliqueAnimationState {
  startHeight: number;
  targetHeight: number;
  duration: number;
  startTime: number;
}

const cameraObliqueCorrectionStateMap = new WeakMap<
  Scene,
  CameraObliqueAnimationState
>();

export const cesiumCameraForceOblique = (
  scene: Scene,
  fixedPitch: number,
  fixedHeight: number,
  shouldSuspendRef: React.MutableRefObject<boolean>
) => {
  if (!scene || !scene.globe || !scene.camera || shouldSuspendRef.current) {
    return;
  }
  const currentPosition = scene.camera.position;
  const currentCartographic = Cartographic.fromCartesian(currentPosition);
  if (!currentCartographic || !defined(currentCartographic)) {
    console.warn("Invalid current cartographic position");
    return;
  }

  const currentPitch = scene.camera.pitch;
  const currentHeight = currentCartographic.height;

  const [targetPitch, pitchNeedsCorrection] = clampToToleranceRange(
    currentPitch,
    fixedPitch,
    PITCH_TOLERANCE_THRESHOLD
  );

  const [targetHeight, heightNeedsCorrection] = clampToToleranceRange(
    currentHeight,
    fixedHeight,
    HEIGHT_TOLERANCE_THRESHOLD
  );

  // Only apply corrections if needed
  if (heightNeedsCorrection || pitchNeedsCorrection) {
    const now = performance.now();
    let anim = cameraObliqueCorrectionStateMap.get(scene);

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
      cameraObliqueCorrectionStateMap.set(scene, anim);
    }
    const elapsed = now - anim.startTime;
    const t = Math.min(1, elapsed / anim.duration);
    const easedT = EasingFunction.CUBIC_IN_OUT(t);
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
            cameraObliqueCorrectionStateMap.delete(scene);
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
      cameraObliqueCorrectionStateMap.delete(scene);
    }
    return;
  }
  // Always clear the state if no correction is needed
  cameraObliqueCorrectionStateMap.delete(scene);
};
