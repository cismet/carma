import { Cartesian2, Cartesian3, defined, type Scene } from "@carma/cesium";

const isFiniteCartesian2 = (position: Cartesian2): boolean =>
  Number.isFinite(position.x) && Number.isFinite(position.y);

/**
 * Checks if a 3D point is occluded by terrain or other geometry
 * @param scene - The Cesium scene instance
 * @param point3D - The 3D position to check for occlusion
 * @param canvasPosition - The screen coordinates of the point
 * @param tolerance - Distance tolerance in meters (default: 1.0)
 * @returns true if the point is occluded, false otherwise
 */
export function isPointOccluded(
  scene: Scene,
  point3D: Cartesian3,
  canvasPosition: Cartesian2,
  tolerance: number = 1.0
): boolean {
  if (!scene || scene.isDestroyed()) {
    return false;
  }

  if (!isFiniteCartesian2(canvasPosition)) {
    return false;
  }

  // Check for valid drawing buffer dimensions to prevent errors during hot reload/resize
  // when the canvas might have 0 width/height, causing "normalized result is not a number"
  // in scene.pick -> computeCullingVolume.
  if (
    scene.drawingBufferWidth <= 0 ||
    scene.drawingBufferHeight <= 0 ||
    scene.canvas.clientWidth <= 0 ||
    scene.canvas.clientHeight <= 0
  ) {
    return false;
  }

  let pickedObject;
  try {
    // Use Cesium's scene.pick to test visibility against depth buffer
    pickedObject = scene.pick(canvasPosition);
  } catch {
    // During HMR / resize Cesium can have a transient invalid frustum state.
    // Treat as "not occluded" and continue rendering labels.
    return false;
  }

  if (defined(pickedObject)) {
    let pickedCartesian;
    try {
      // Get the depth of the picked object
      pickedCartesian = scene.pickPosition(canvasPosition);
    } catch {
      return false;
    }

    if (defined(pickedCartesian)) {
      // Calculate distances from camera
      const cameraPosition = scene.camera.position;
      const pointDistance = Cartesian3.distance(cameraPosition, point3D);
      const pickedDistance = Cartesian3.distance(
        cameraPosition,
        pickedCartesian
      );

      // Point is occluded if something is closer to the camera
      return pickedDistance < pointDistance - tolerance;
    }
  }

  return false;
}
