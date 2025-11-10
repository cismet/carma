import { type Scene } from "@carma/cesium";
import type { Meters, Radians } from "@carma/units/types";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";

/**
 * Calculate Leaflet zoom level from Cesium scene center camera height
 * Pure geometric calculation - no DPR compensation needed!
 *
 * @param scene - Cesium scene (only needs camera FOV)
 * @param cameraHeight - Camera height above ground in meters
 * @param latitude - Latitude in radians for Web Mercator correction
 * @param cssViewportWidth - Viewport width in CSS pixels (NOT drawing buffer!)
 * @param cssViewportHeight - Viewport height in CSS pixels (NOT drawing buffer!)
 */
export const sceneCenterPixelSizeToLeafletZoom = (
  scene: Scene,
  cameraHeight: number,
  latitude: number,
  cssViewportWidth: number,
  cssViewportHeight: number
): number => {
  const { camera } = scene;

  // Get FOV from camera frustum
  const frustum = camera.frustum;
  const fov = "fov" in frustum ? frustum.fov : Math.PI / 3; // Default ~60 degrees

  // Use longer edge dimension (FOV always corresponds to longer edge in Cesium)
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  // Pure geometry: How much ground distance does the FOV cover?
  const groundRadius = cameraHeight * Math.tan(fov / 2);
  const groundDiameter = 2 * groundRadius;

  // Meters per CSS pixel (what Leaflet uses for zoom calculation)
  const metersPerCssPixel = groundDiameter / longerEdgeCss;

  // Convert to Leaflet zoom using latitude for Web Mercator projection
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCssPixel as Meters,
    latitude as Radians
  );

  return Number.isFinite(zoom) && zoom !== Infinity ? zoom : 12;
};
