import { type Scene } from "@carma/cesium";
import type { Meters, Radians } from "@carma/units/types";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";

/**
 * Calculate Leaflet zoom level from Cesium camera height
 * 
 * Uses CSS viewport dimensions to calculate ground coverage at camera height.
 */
export const sceneCenterPixelSizeToLeafletZoom = (
  scene: Scene,
  cameraHeight: number,
  latitude: number,
  cssViewportWidth: number,
  cssViewportHeight: number
): number => {
  const { camera } = scene;

  const frustum = camera.frustum;
  const fov = "fov" in frustum ? frustum.fov : Math.PI / 3;

  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  const groundRadius = cameraHeight * Math.tan(fov / 2);
  const groundDiameter = 2 * groundRadius;

  const metersPerCssPixel = groundDiameter / longerEdgeCss;

  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCssPixel as Meters,
    latitude as Radians
  );

  return Number.isFinite(zoom) && zoom !== Infinity ? zoom : 12;
};
