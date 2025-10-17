import type { Scene } from "cesium";
import type { LatLngZoom } from "@carma/types";

import type { Zoom, Zoom256 } from "@carma/units/types";
import type { LatLng } from "@carma/geo/types";
import { isZoom } from "@carma/units/helpers";

import { normalizeOptions } from "@carma-commons/utils";

import {
  getPixelSizeForPosition,
  cesiumCenterPixelSizeToLeafletZoom,
} from "../picking";
import { cameraPositionCartographicDegrees } from "@carma-mapping/engines/cesium/api";

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
  scene: Scene,
  options?: Options
): Promise<LatLngZoom> => {
  const { maxZoom, minZoom } = normalizeOptions(options, defaultOptions);

  let center: LatLng.deg | undefined;

  let zoomValue = cesiumCenterPixelSizeToLeafletZoom(scene).value;
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

  center = cameraPositionCartographicDegrees(scene.camera);
  console.debug("[2D3D] fetched center", { center, zoom });

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
