import type { Map as LeafletMap } from "leaflet";
import { cameraToCartographicDegrees } from "./cesiumHelpers";
import type { CesiumContextType } from "../CesiumContext";
import { cesiumCenterPixelSizeToLeafletZoom } from "./pixels";

export const isLeafletZoomValid = (zoom: number) => {
  if (
    zoom === undefined ||
    Number.isNaN(zoom) ||
    zoom === Infinity ||
    zoom === -Infinity
  ) {
    return false;
  } else {
    return true;
  }
};

export const setLeafletView = async (
  ctx: CesiumContextType,
  leafletElement: LeafletMap,
  {
    duration = 0,
    animate = false,
  }: { duration?: number; animate?: boolean } = {}
) => {
  if (!ctx.isValidWidget() || !leafletElement) return;

  let zoom = cesiumCenterPixelSizeToLeafletZoom(ctx).value;
  if (zoom === null) {
    console.warn("zoom is null, skipping");
    return;
  }
  const DEFAULT_2D_ZOOM = 14;
  const MAX_2D_ZOOM = 25;
  const MIN_2D_ZOOM = 9;
  if (zoom > MAX_2D_ZOOM) {
    console.warn("zoom is above max 2d zoom, clamping", MAX_2D_ZOOM, zoom);
    zoom = MAX_2D_ZOOM;
  } else if (zoom < MIN_2D_ZOOM) {
    console.warn("zoom is below min 2d zoom, clamping", MIN_2D_ZOOM, zoom);
    zoom = MIN_2D_ZOOM;
  } else if (isNaN(zoom)) {
    console.warn("zoom is NaN", MIN_2D_ZOOM, zoom);
    zoom = DEFAULT_2D_ZOOM;
  }

  ctx.withCamera((camera) => {
    const { longitude: lng, latitude: lat } =
      cameraToCartographicDegrees(camera);
    console.debug("[2D3D|LEAFLET] setView", { lng, lat, zoom });
    leafletElement.setView({ lng, lat }, zoom, { duration, animate });
  });
};
