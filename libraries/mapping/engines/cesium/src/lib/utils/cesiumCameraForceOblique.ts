import { Cartesian3, Math as CesiumMath, type Viewer } from "cesium";

const PITCH_TOLERANCE_THRESHOLD = CesiumMath.toRadians(10);
const HEIGHT_TOLERANCE_THRESHOLD = 150.0;

const VALID_CORRECTION_DISTANCE_THRESHOLD = 10000.0;

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

  // Calculate target values only if outside tolerance bands
  let targetPitch = currentPitch;
  let targetHeight = currentHeight;
  let needsCorrection = false;

  // Check if pitch exceeds tolerance band and clip if necessary
  if (currentPitch > fixedPitch + PITCH_TOLERANCE_THRESHOLD) {
    targetPitch = fixedPitch + PITCH_TOLERANCE_THRESHOLD;
    needsCorrection = true;
  } else if (currentPitch < fixedPitch - PITCH_TOLERANCE_THRESHOLD) {
    targetPitch = fixedPitch - PITCH_TOLERANCE_THRESHOLD;
    needsCorrection = true;
  }

  // Check if height exceeds tolerance band and clip if necessary
  if (currentHeight > fixedHeight + HEIGHT_TOLERANCE_THRESHOLD) {
    targetHeight = fixedHeight + HEIGHT_TOLERANCE_THRESHOLD;
    needsCorrection = true;
  } else if (currentHeight < fixedHeight - HEIGHT_TOLERANCE_THRESHOLD) {
    targetHeight = fixedHeight - HEIGHT_TOLERANCE_THRESHOLD;
    needsCorrection = true;
  }

  // Only apply corrections if needed
  if (needsCorrection) {
    const longitude = currentCartographic.longitude;
    const latitude = currentCartographic.latitude;

    const fixedPosition = Cartesian3.fromRadians(
      longitude,
      latitude,
      targetHeight
    );

    const distance = Cartesian3.distance(fixedPosition, viewer.camera.position);

    if (distance > VALID_CORRECTION_DISTANCE_THRESHOLD) {
      console.debug(distance, "Target position is too far away, aborting");
      return;
    }

    viewer.camera.setView({
      destination: fixedPosition,
      orientation: {
        heading: viewer.camera.heading,
        pitch: targetPitch,
        roll: 0,
      },
    });
  }
};
