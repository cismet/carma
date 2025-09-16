// WEB MAPS TO CESIUM
import { Cartographic, Math as CesiumMath } from "cesium";
import type { Map as LeafletMap } from "leaflet";

import {
  asRadians,
  getPixelResolutionFromZoomAtLatitudeRad,
} from "@carma-commons/utils";

import type { CesiumContextType } from "../CesiumContext";

import { getCesiumCameraPixelDimensionForDistance } from "./cesiumCamera";
import { getCameraHeightAboveGround } from "./cesiumHelpers";
import { getElevationAsync } from "./elevation";
import { isLeafletZoomValid } from "./leafletHelpers";
import { getScenePixelSize } from "./pixels";

export const leafletToCesium = async (
  leaflet: LeafletMap,
  ctx: CesiumContextType,
  {
    epsilon = 0.5,
    limit = 5,
    cause = "not specified",
    onComplete,
    fallbackHeight = 150, // min height for local terrain
  }: {
    epsilon?: number;
    limit?: number;
    cause?: string;
    onComplete?: Function;
    fallbackHeight?: number;
  }
) => {
  if (!ctx.isValidViewer()) {
    console.warn("No viewer available for transition");
    return false;
  }
  if (!leaflet) {
    console.warn("No leaflet map available for transition");
    return false;
  }

  const center = leaflet.getCenter();
  const { lat, lng } = center;
  const zoom = leaflet.getZoom();
  // cancel any ongoing animation
  leaflet.setView(center, zoom, { animate: false });

  if (!isLeafletZoomValid(zoom)) {
    console.warn("No zoom level available for transition");
    return false;
  }

  const lngRad = CesiumMath.toRadians(lng);
  const latRad = CesiumMath.toRadians(lat);

  const targetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    asRadians(latRad)
  );

  const START_DISTANCE = 1000;

  const baseComputedPixelResolution = getCesiumCameraPixelDimensionForDistance(
    ctx,
    START_DISTANCE
  )?.average;

  if (
    baseComputedPixelResolution === null ||
    baseComputedPixelResolution === undefined
  ) {
    console.warn(
      "No base computed pixel resolution found for distance",
      START_DISTANCE
    );
    return false;
  }

  const resolutionRatio = targetPixelResolution / baseComputedPixelResolution;

  const computedDistance = START_DISTANCE * resolutionRatio;

  let currentPixelResolution = getScenePixelSize(ctx).value;

  if (currentPixelResolution === null) {
    console.warn("No pixel size found for camera position");
    return false;
  }

  const cameraGroundPosition = Cartographic.fromRadians(
    lngRad,
    latRad,
    fallbackHeight
  );

  const [elevation] = await getElevationAsync(ctx, [cameraGroundPosition]);

  if (!elevation) {
    console.warn("No elevation found for camera position");
    return false;
  }

  const { terrain, surface } = elevation;

  console.debug(
    "L2C [2D3D|CESIUM|CAMERA] elevations",
    terrain,
    surface,
    fallbackHeight
  );

  const cameraDestinationCartographic = cameraGroundPosition.clone();
  cameraDestinationCartographic.height += computedDistance;

  const destination = Cartographic.toCartesian(cameraDestinationCartographic);

  console.debug(
    `L2C [2D3D|CESIUM|CAMERA] cause: ${cause} lat: ${lat} lng: ${lng} z: ${zoom}`
  );
  console.debug("L2C [2D3D|CESIUM|CAMERA] destination", destination);
  console.debug(
    "L2C [2D3D|CESIUM|CAMERA] cameraDestinationCartographic",
    cameraDestinationCartographic.height
  );
  console.debug(
    "L2C [2D3D|CESIUM|CAMERA] cameraGroundPosition",
    cameraGroundPosition.height
  );
  console.debug("L2C [2D3D|CESIUM|CAMERA] computedDistance", computedDistance);

  window.requestAnimationFrame(() => {
    ctx.withCamera((camera) => {
      camera.setView({ destination });
    });
  });

  ctx.withCamera((camera) => {
    const cameraPositionAtStart = camera.position.clone();
    let { cameraHeightAboveGround, groundHeight } =
      getCameraHeightAboveGround(ctx);
    const maxIterations = limit;
    let iterations = 0;

    if (currentPixelResolution === null) {
      console.warn("No pixel size found for camera position");
      return false;
    }

    // Iterative adjustment to match the target resolution
    while (Math.abs(currentPixelResolution - targetPixelResolution) > epsilon) {
      if (iterations >= maxIterations) {
        console.warn(
          "Maximum height finding iterations reached with no result, restoring last Cesium camera position."
        );
        console.debug("L2C [2D3D] iterate", iterations, cameraPositionAtStart);
        ctx.withCamera((camera) => {
          camera.setView({ destination: cameraPositionAtStart });
        });
        return false;
      }

      const adjustmentFactor = targetPixelResolution / currentPixelResolution;
      cameraHeightAboveGround *= adjustmentFactor;
      const newCameraHeight = cameraHeightAboveGround + groundHeight;

      const updatedCameraDestinationCartographic = Cartographic.fromRadians(
        lngRad,
        latRad,
        newCameraHeight
      );
      const updatedDestination = Cartographic.toCartesian(
        updatedCameraDestinationCartographic
      );

      console.debug(
        "L2C [2D3D|CESIUM|CAMERA] setview",
        iterations,
        newCameraHeight,
        updatedDestination
      );
      ctx.withCamera((camera) => {
        camera.setView({
          destination: updatedDestination,
        });
      });
      const newResolution = getScenePixelSize(ctx).value;
      if (newResolution === null) {
        return false;
      }
      currentPixelResolution = newResolution;
      iterations++;
    }
  });
  ctx.requestRender();
  onComplete && onComplete();
  return true; // Return true if camera position found within max iterations
};
