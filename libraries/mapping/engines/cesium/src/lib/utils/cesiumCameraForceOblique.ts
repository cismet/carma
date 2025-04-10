import { Cartesian3, Math as CesiumMath, type Viewer } from "cesium";

const PITCH_TOLERANCE_THRESHOLD = CesiumMath.toRadians(10);
const HEIGHT_TOLERANCE_THRESHOLD = 150.0;

const VALID_CORRECTION_DISTANCE_THRESHOLD = 10000.0;

export const cesiumCameraForceOblique = (
  viewer: Viewer,
  fixedPitch: number,
  fixedHeight: number
) => {
  // Safety checks for viewer and its components
  if (!viewer || !viewer.scene || !viewer.scene.globe || !viewer.camera) {
    return;
  }

  const currentPosition = viewer.camera.position;
  const ellipsoid = viewer.scene.globe.ellipsoid;

  // Handle potential null from cartesianToCartographic
  const currentCartographic =
    ellipsoid.cartesianToCartographic(currentPosition);
  if (!currentCartographic) {
    return;
  }

  const currentPitch = viewer.camera.pitch;

  const heightDifference = Math.abs(currentCartographic.height - fixedHeight);
  const pitchDifference = Math.abs(currentPitch - fixedPitch);

  const shouldPitchCorrect = pitchDifference > PITCH_TOLERANCE_THRESHOLD;
  const shouldHeightCorrect = heightDifference > HEIGHT_TOLERANCE_THRESHOLD;

  if (shouldPitchCorrect || shouldHeightCorrect) {
    const longitude = currentCartographic.longitude;
    const latitude = currentCartographic.latitude;

    const fixedPosition = Cartesian3.fromRadians(
      longitude,
      latitude,
      fixedHeight
    );

    const distance = Cartesian3.distance(fixedPosition, viewer.camera.position);

    if (distance > VALID_CORRECTION_DISTANCE_THRESHOLD) {
      console.warn(distance, "Target position is too far away, aborting");
      return;
    }

    viewer.camera.setView({
      destination: fixedPosition,
      orientation: {
        heading: viewer.camera.heading,
        pitch: fixedPitch,
        roll: 0,
      },
    });
  }
};
