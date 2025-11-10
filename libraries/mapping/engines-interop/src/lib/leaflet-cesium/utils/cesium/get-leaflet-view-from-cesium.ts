import type { Scene, Cartographic } from "@carma/cesium";
import type { Meters, Radians } from "@carma/units/types";
import { radToDegNumeric } from "@carma/units/helpers";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";

export type LeafletView = {
  center: { lat: number; lng: number };
  zoom: number;
};

/**
 * Calculate Leaflet view (center + zoom) from Cesium camera state
 * Uses Cesium's frustum.fov which automatically handles aspect ratio
 *
 * @param scene - Cesium scene
 * @param cartographic - Position to center the Leaflet map
 * @param distance - Distance from camera to ground position
 * @param resolutionScale - Resolution scale factor
 */
export const getLeafletViewFromCesium = (
  scene: Scene,
  cartographic: Cartographic,
  distance: number,
  resolutionScale: number = 1.0
): LeafletView => {
  const { camera, drawingBufferWidth, drawingBufferHeight } = scene;

  // Cesium's frustum.fov is ALWAYS for the longer edge dimension
  const frustum = camera.frustum;
  const fov = "fov" in frustum ? frustum.fov : Math.PI / 3; // Default ~60 degrees
  const longerEdge = Math.max(drawingBufferWidth, drawingBufferHeight);

  // Ground distance visible = 2 * distance * tan(fov/2)
  const groundDistance = 2 * distance * Math.tan(fov / 2);

  // Pixel resolution = ground distance per pixel
  const pixelResolution = (groundDistance / longerEdge) * resolutionScale;

  // Convert to Leaflet zoom using latitude for accurate web mercator calculation
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    pixelResolution as Meters,
    cartographic.latitude as Radians
  );

  const finalZoom = Number.isFinite(zoom) && zoom !== Infinity ? zoom : 12;

  return {
    center: {
      lat: radToDegNumeric(cartographic.latitude),
      lng: radToDegNumeric(cartographic.longitude),
    },
    zoom: finalZoom,
  };
};
