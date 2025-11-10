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
 * Pure geometric calculation - no DPR compensation needed!
 *
 * @param scene - Cesium scene (only needs camera FOV)
 * @param cartographic - Position to center the Leaflet map
 * @param distance - Distance from camera to ground position in meters
 * @param cssViewportWidth - Viewport width in CSS pixels (NOT drawing buffer!)
 * @param cssViewportHeight - Viewport height in CSS pixels (NOT drawing buffer!)
 */
export const getLeafletViewFromCesium = (
  scene: Scene,
  cartographic: Cartographic,
  distance: number,
  cssViewportWidth: number,
  cssViewportHeight: number
): LeafletView => {
  const { camera } = scene;

  // Get FOV from camera frustum
  const frustum = camera.frustum;
  const fov = "fov" in frustum ? frustum.fov : Math.PI / 3; // Default ~60 degrees

  // Use longer edge dimension (FOV always corresponds to longer edge in Cesium)
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  // Pure geometry: How much ground distance does the FOV cover?
  const groundRadius = distance * Math.tan(fov / 2);
  const groundDiameter = 2 * groundRadius;

  // Meters per CSS pixel (what Leaflet uses for zoom calculation)
  const metersPerCssPixel = groundDiameter / longerEdgeCss;

  // Convert to Leaflet zoom using latitude for Web Mercator projection
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCssPixel as Meters,
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
