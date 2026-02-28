import { Viewer, Cartesian3, Cartesian2, defined } from "cesium";

/**
 * Checks if a 3D point is occluded by terrain or other geometry
 * @param viewer - The Cesium viewer instance
 * @param point3D - The 3D position to check for occlusion
 * @param canvasPosition - The screen coordinates of the point
 * @param tolerance - Distance tolerance in meters (default: 1.0)
 * @returns true if the point is occluded, false otherwise
 */
export function isPointOccluded(
  viewer: Viewer,
  point3D: Cartesian3,
  canvasPosition: Cartesian2,
  tolerance: number = 1.0
): boolean {
  if (!viewer || viewer.isDestroyed()) {
    return false;
  }

  // Use Cesium's scene.pick to test visibility against depth buffer
  const pickedObject = viewer.scene.pick(canvasPosition);

  if (defined(pickedObject)) {
    // Get the depth of the picked object
    const pickedCartesian = viewer.scene.pickPosition(canvasPosition);

    if (defined(pickedCartesian)) {
      // Calculate distances from camera
      const cameraPosition = viewer.scene.camera.position;
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
  const verticalPadding = paddingVertical ?? paddingHorizontal;
  return (
    canvasPosition.x >= -paddingHorizontal &&
    canvasPosition.x <= canvasWidth + paddingHorizontal &&
    canvasPosition.y >= -verticalPadding &&
    canvasPosition.y <= canvasHeight + verticalPadding
  );
}
