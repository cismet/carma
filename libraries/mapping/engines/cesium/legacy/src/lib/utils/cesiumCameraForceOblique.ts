import { clampToToleranceRange } from "@carma-commons/utils";
import {
  Cartesian3,
  Math as CesiumMath,
  type Viewer,
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
  Viewer,
  CameraObliqueAnimationState
>();

export const cesiumCameraForceOblique = (
  viewer: Viewer,
  fixedPitch: number,
  fixedHeight: number,
  shouldSuspendRef: React.MutableRefObject<boolean>
) => {
  if (
    !viewer ||
    !viewer.scene ||
    !viewer.scene.globe ||
    !viewer.camera ||
    shouldSuspendRef.current
  ) {
    return;
  }
  const currentPosition = viewer.camera.position;
  const currentCartographic = Cartographic.fromCartesian(currentPosition);
  if (!currentCartographic || !defined(currentCartographic)) {
    console.warn("Invalid current cartographic position");
    return;
  }

  const currentPitch = viewer.camera.pitch;
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
    let anim = cameraObliqueCorrectionStateMap.get(viewer);

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
      cameraObliqueCorrectionStateMap.set(viewer, anim);
    }
    const elapsed = now - anim.startTime;
    const t = Math.min(1, elapsed / anim.duration);
    const easedT = EasingFunction.CUBIC_IN_OUT(t);
    const nextHeight =
      anim.startHeight + (anim.targetHeight - anim.startHeight) * easedT;
    // Move along the camera's view direction (zoom ray) using trigonometry
    const cameraDir = viewer.camera.direction;
    const cameraPos = viewer.camera.position;
    const pitchCos = Math.cos(viewer.camera.pitch);
    if (Math.abs(pitchCos) > 1e-3) {
      try {
        let zoomTravelDistance = (currentHeight - nextHeight) / pitchCos;
        if (isNaN(zoomTravelDistance) || !Number.isFinite(zoomTravelDistance)) {
          console.warn(
            "Invalid travel distance calculated, resetting to 0",
            zoomTravelDistance,
            currentHeight,
            nextHeight,
            pitchCos
          );
          zoomTravelDistance = 0;
        }
        // Clamp travel distance to avoid huge jumps
        zoomTravelDistance = CesiumMath.clamp(zoomTravelDistance, -100, 100);
        const newPos = Cartesian3.add(
          cameraPos,
          Cartesian3.multiplyByScalar(
            cameraDir,
            zoomTravelDistance,
            new Cartesian3()
          ),
          new Cartesian3()
        );
        viewer.camera.position = newPos;
        defined(newPos) &&
          viewer.camera.setView({
            destination: newPos,
            orientation: {
              heading: viewer.camera.heading,
              pitch: targetPitch,
              roll: 0,
            },
          });
      } catch (error) {
        console.warn("Error setting camera position:", error);
      }
    }
    if (t === 1) {
      cameraObliqueCorrectionStateMap.delete(viewer);
    }
    return;
  }
  // Always clear the state if no correction is needed
  cameraObliqueCorrectionStateMap.delete(viewer);
};
