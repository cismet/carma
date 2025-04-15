import { clampToToleranceRange } from "@carma-commons/utils";
import {
  Cartesian3,
  Math as CesiumMath,
  type Viewer,
  EasingFunction,
} from "cesium";

const PITCH_TOLERANCE_THRESHOLD = CesiumMath.toRadians(10);
const HEIGHT_TOLERANCE_THRESHOLD = 150.0;

interface CameraObliqueAnimationState {
  startHeight: number;
  targetHeight: number;
  duration: number;
  startTime: number;
}

const cameraObliqueAnimationMap = new WeakMap<
  Viewer,
  CameraObliqueAnimationState
>();

export const cesiumCameraForceOblique = (
  viewer: Viewer,
  fixedPitch: number,
  fixedHeight: number
) => {
  if (!viewer || !viewer.scene || !viewer.scene.globe || !viewer.camera) {
    return;
  }

  const currentPosition = viewer.camera.position;
  const ellipsoid = viewer.scene.globe.ellipsoid;

  const currentCartographic =
    ellipsoid.cartesianToCartographic(currentPosition);
  if (!currentCartographic) {
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
    // Height correction with cubic easeInOut animation along the camera's view direction (zoom ray)
    const now = performance.now();
    let anim = cameraObliqueAnimationMap.get(viewer);
    if (!anim || anim.targetHeight !== targetHeight) {
      anim = {
        startHeight: currentHeight,
        targetHeight,
        duration: 600, // ms
        startTime: now,
      };
      cameraObliqueAnimationMap.set(viewer, anim);
    }
    const elapsed = now - anim.startTime;
    const t = Math.min(1, elapsed / anim.duration);
    const easedT = EasingFunction.CUBIC_IN_OUT(t);
    const nextHeight =
      anim.startHeight + (anim.targetHeight - anim.startHeight) * easedT;
    // Move along the camera's view direction (zoom ray)
    const cameraDir = viewer.camera.direction;
    const cameraPos = viewer.camera.position;
    // Find the scalar to move along the direction vector to reach the nextHeight
    // We'll use a simple iterative approach to find the right distance
    let newPos = cameraPos;
    let found = false;
    let low = 0;
    let high = 10000; // 10km max zoom step
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      const candidate = Cartesian3.add(
        cameraPos,
        Cartesian3.multiplyByScalar(cameraDir, mid, new Cartesian3()),
        new Cartesian3()
      );
      const candidateCarto = ellipsoid.cartesianToCartographic(candidate);
      if (!candidateCarto) break;
      if (Math.abs(candidateCarto.height - nextHeight) < 0.5) {
        newPos = candidate;
        found = true;
        break;
      }
      if (candidateCarto.height > nextHeight) {
        low = mid;
      } else {
        high = mid;
      }
    }
    if (!found) {
      // fallback: just move a small step along the direction
      newPos = Cartesian3.add(
        cameraPos,
        Cartesian3.multiplyByScalar(cameraDir, 10, new Cartesian3()),
        new Cartesian3()
      );
    }
    viewer.camera.setView({
      destination: newPos,
      orientation: {
        heading: viewer.camera.heading,
        pitch: targetPitch,
        roll: 0,
      },
    });
    if (t === 1) {
      cameraObliqueAnimationMap.delete(viewer);
    }
    return;
  }
  // If no correction needed, clear animation state
  cameraObliqueAnimationMap.delete(viewer);
};
