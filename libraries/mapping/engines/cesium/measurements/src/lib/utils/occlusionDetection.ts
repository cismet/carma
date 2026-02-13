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

/**
 * Checks if a point is within the viewport bounds with optional padding
 * @param canvasPosition - The screen coordinates to check
 * @param canvasWidth - Width of the canvas
 * @param canvasHeight - Height of the canvas
 * @param paddingHorizontal - Horizontal padding in pixels (default: 0)
 * @param paddingVertical - Vertical padding in pixels (default: uses paddingHorizontal)
 * @returns true if the point is within viewport bounds
 */
export function isPointInViewport(
  canvasPosition: Cartesian2,
  canvasWidth: number,
  canvasHeight: number,
  paddingHorizontal: number = 0,
  paddingVertical?: number
): boolean {
  if (
    !isFiniteCartesian2(canvasPosition) ||
    !Number.isFinite(canvasWidth) ||
    !Number.isFinite(canvasHeight)
  ) {
    return false;
  }

  const verticalPadding = paddingVertical ?? paddingHorizontal;
  return (
    canvasPosition.x >= -paddingHorizontal &&
    canvasPosition.x <= canvasWidth + paddingHorizontal &&
    canvasPosition.y >= -verticalPadding &&
    canvasPosition.y <= canvasHeight + verticalPadding
  );
}
