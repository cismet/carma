import {
  cameraPositionCartographicDegrees,
  isValidScene,
  type Scene,
} from "@carma/cesium";

import { sceneCenterPixelSizeToLeafletZoom } from "../cesium/scene-center-pixel-size-to-leaflet-zoom";

import type { LatLng, LatLngZoom, Zoom, Zoom256 } from "@carma/types";

import { normalizeOptions } from "@carma-commons/utils";

import { isZoom } from "@carma/units/helpers";

type Options = {
  maxZoom?: Zoom256;
  minZoom?: Zoom256;
};

const defaultOptions: Required<Options> = {
  maxZoom: 22 as Zoom256,
  minZoom: 10 as Zoom256,
};

export const getTiledMapCenterZoomEquivalent = async (
  scene: Scene,
  options?: Options
): Promise<LatLngZoom> => {
  if (!isValidScene(scene)) {
    throw new Error("scene is not valid");
  }

  const { camera } = scene;

  const { maxZoom, minZoom } = normalizeOptions(options, defaultOptions);

  let center: LatLng.deg | undefined;

  let zoomValue = sceneCenterPixelSizeToLeafletZoom(scene).value;
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

  center = cameraPositionCartographicDegrees(camera);
  console.debug("[2D3D] fetched center", { center, zoom });

  if (
    center === undefined ||
    !Number.isFinite(center.latitude) ||
    !Number.isFinite(center.longitude)
  ) {
    console.warn("latitude or longitude is undefined, skipping");
    throw new Error("latitude or longitude is undefined");
  }

  return { latitude: center.latitude, longitude: center.longitude, zoom };
};
