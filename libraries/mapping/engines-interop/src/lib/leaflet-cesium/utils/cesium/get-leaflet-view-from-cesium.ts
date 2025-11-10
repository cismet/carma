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
 * 
 * Uses CSS viewport dimensions to calculate ground coverage, then converts to Leaflet zoom.
 */
export const getLeafletViewFromCesium = (
  scene: Scene,
  cartographic: Cartographic,
  distance: number,
  cssViewportWidth: number,
  cssViewportHeight: number
): LeafletView => {
  const { camera } = scene;

  const frustum = camera.frustum;
  const fov = "fov" in frustum ? frustum.fov : Math.PI / 3;

  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  const groundRadius = distance * Math.tan(fov / 2);
  const groundDiameter = 2 * groundRadius;

  const metersPerCssPixel = groundDiameter / longerEdgeCss;

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
