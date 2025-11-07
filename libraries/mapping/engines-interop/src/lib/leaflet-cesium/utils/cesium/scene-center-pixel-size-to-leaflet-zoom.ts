import { type Scene } from "@carma/cesium";
import type { Meters, Radians } from "@carma/units/types";
import type { NumericResult } from "@carma/types";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";

/**
 * Calculate Leaflet zoom level from Cesium camera state
 * Uses Cesium's frustum.fov which automatically handles aspect ratio
 */
export const sceneCenterPixelSizeToLeafletZoom = (
  scene: Scene,
  resolutionScale = 1.0
): NumericResult => {
  const { camera, drawingBufferWidth, drawingBufferHeight } = scene;

  if (!camera) {
    return { value: null, error: "No camera found" };
  }

  const cameraHeight = camera.positionCartographic.height;

  // Cesium's frustum.fov is ALWAYS for the longer edge dimension
  const frustum = camera.frustum;
  const fov = "fov" in frustum ? frustum.fov : Math.PI / 3; // Default ~60 degrees
  const longerEdge = Math.max(drawingBufferWidth, drawingBufferHeight);

  // Ground distance visible = 2 * distance * tan(fov/2)
  const groundDistance = 2 * cameraHeight * Math.tan(fov / 2);

  // Pixel resolution = ground distance per pixel
  const pixelResolution = (groundDistance / longerEdge) * resolutionScale;

  // Convert to Leaflet zoom using latitude for accurate web mercator calculation
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    pixelResolution as Meters,
    camera.positionCartographic.latitude as Radians
  );

  if (!Number.isFinite(zoom) || zoom === Infinity) {
    console.warn("[CESIUM|ZOOM] Invalid zoom calculated:", zoom);
    return { value: null, error: "Invalid zoom calculated" };
  }

  return { value: zoom };
};
