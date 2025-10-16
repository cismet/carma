import type { LatLng } from "@carma/geo/types";
import type { LatLngZoom, Zoom, Zoom256 } from "@carma/types";

import { normalizeOptions } from "@carma-commons/utils";
import { isZoom } from "@carma/units/helpers";

import { cameraToCartographicDegrees } from "./cesiumHelpers";
import type { CesiumContextType } from "../CesiumContext";
import { cesiumCenterPixelSizeToLeafletZoom } from "./pixels";

type Options = {
  maxZoom?: Zoom256;
  minZoom?: Zoom256;
};

const defaultOptions: Required<Options> = {
  maxZoom: 22 as Zoom256,
  minZoom: 10 as Zoom256,
};

/**
 * Returns the center of the current Cesium camera as a LatLngZoom object.
 * @param ctx
 * @param options
 * @returns Promise<LatLngZoom>
 */

export const getTiledMapCenterZoomEquivalent = async (
  ctx: CesiumContextType,
  options?: Options
): Promise<LatLngZoom> => {
  if (!ctx.isValidViewer()) {
    throw new Error("viewer is not valid");
  }

  const { maxZoom, minZoom } = normalizeOptions(options, defaultOptions);

  let center: LatLng.deg | undefined;

  let zoomValue = cesiumCenterPixelSizeToLeafletZoom(ctx).value;
  if (!isZoom(zoomValue)) {
    throw new Error("zoom is not valid");
  }

  let zoom: Zoom = zoomValue as Zoom;

  if (zoom > maxZoom) {
    console.info("zoom is above max 2d zoom, clamping", maxZoom, zoom);
    zoom = maxZoom;
  } else if (zoom < minZoom) {
    console.info("zoom is below min 2d zoom, clamping", minZoom, zoom);
    zoom = minZoom;
  }

  ctx.withCamera((camera) => {
    center = cameraToCartographicDegrees(camera);
    console.debug("[2D3D] fetched center", { center, zoom });
  });

  if (
    center === undefined ||
    !Number.isFinite(center.latitude) ||
    !Number.isFinite(center.longitude)
  ) {
    console.warn("latitude or longitude is undefined, skipping");
    throw new Error("latitude or longitude is undefined");
  }

  return { lat: center.latitude, lng: center.longitude, zoom };
};
