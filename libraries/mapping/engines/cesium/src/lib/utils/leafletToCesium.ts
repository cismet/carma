// WEB MAPS TO CESIUM
import { Cartesian3, Math as CesiumMath, Viewer } from "cesium";
import type { Map as LeafletMap } from "leaflet";

import {
  getCameraHeightAboveGround,
  getPixelResolutionFromZoomAtLatitude,
  getScenePixelSize,
} from "./cesiumHelpers";
import { isLeafletZoomValid } from "./leafletHelpers";
import { getCesiumCameraPixelDimensionForDistance } from "./cesiumCamera";

export const leafletToCesium = (
  leaflet: LeafletMap,
  viewer: Viewer,
  {
    epsilon = 0.5,
    limit = 5,
    cause = "not specified",
    onComplete,
  }: {
    epsilon?: number;
    limit?: number;
    cause?: string;
    onComplete?: Function;
  } = {},
) => {
  if (!viewer) {
    console.warn("No viewer available for transition");
    return false;
  }
  if (!leaflet) {
    console.warn("No leaflet map available for transition");
    return false;
  }

  const { lat, lng } = leaflet.getCenter();
  const zoom = leaflet.getZoom();

  if (!isLeafletZoomValid(zoom)) {
    console.warn("No zoom level available for transition");
    return false;
  }

  const lngRad = CesiumMath.toRadians(lng);
  const latRad = CesiumMath.toRadians(lat);

  const targetPixelResolution = getPixelResolutionFromZoomAtLatitude(
    zoom,
    latRad,
  );

  const START_DISTANCE = 10000;

  const baseComputedPixelResolution = getCesiumCameraPixelDimensionForDistance(
    viewer,
    START_DISTANCE,
  )?.average;

  if (
    baseComputedPixelResolution === null ||
    baseComputedPixelResolution === undefined
  ) {
    console.warn(
      "No base computed pixel resolution found for distance",
      START_DISTANCE,
    );
    return false;
  }

  const resolutionRatio = targetPixelResolution / baseComputedPixelResolution;

  const baseHeight = START_DISTANCE * resolutionRatio;

  console.log("xxx baseComputedHeight", baseHeight, resolutionRatio);


  let currentPixelResolution = getScenePixelSize(viewer).value;

  if (currentPixelResolution === null) {
    console.warn("No pixel size found for camera position");
    return false;
  } else {
    console.info(
      `L2C [2D3D|CESIUM|CAMERA] cause: ${cause} lat: ${lat} lng: ${lng} z: ${zoom} px: ${targetPixelResolution} dpr: ${window.devicePixelRatio}, resScale: ${viewer.resolutionScale} heights[base,current]:`,
      baseHeight,
      currentPixelResolution,
    );
  }

  const { camera } = viewer;

  let targetHeight = camera.positionCartographic.height;

  if (targetHeight > 50000) {
    console.warn(
      "zoom request viewer height too high, applying base height",
      baseHeight,
      targetHeight,
    );
    targetHeight = 200 + baseHeight;
  }
  if (targetHeight < 200) {
    console.warn("targetHeight too low setting to min height", 200);
    targetHeight = 200;
  }

  console.info(
    `L2C [2D3D|CESIUM|CAMERA] cause: ${cause} lat: ${lat} lng: ${lng} z: ${zoom} px: ${targetPixelResolution} dpr: ${window.devicePixelRatio}, resScale: ${viewer.resolutionScale} heights[base,target]:`,
    baseHeight,
    targetHeight,
  );

  camera.setView({
    destination: Cartesian3.fromRadians(lngRad, latRad, targetHeight),
  });

  // Get the ground position directly under the camera

  const cameraPositionAtStart = camera.position.clone();
  let { cameraHeightAboveGround, groundHeight } =
    getCameraHeightAboveGround(viewer);
  const maxIterations = limit;
  let iterations = 0;

  // Iterative adjustment to match the target resolution
  while (Math.abs(currentPixelResolution - targetPixelResolution) > epsilon) {
    if (iterations >= maxIterations) {
      console.warn(
        "Maximum height finding iterations reached with no result, restoring last Cesium camera position.",
      );
      console.log(
        "L2C [2D3D] iterate",
        iterations,
        targetHeight,
        cameraPositionAtStart,
      );
      camera.setView({ destination: cameraPositionAtStart });
      return false;
    }
    const adjustmentFactor = targetPixelResolution / currentPixelResolution;
    cameraHeightAboveGround *= adjustmentFactor;
    const newCameraHeight = cameraHeightAboveGround + groundHeight;

    console.log(
      "L2C [2D3D|CESIUM|CAMERA] setview",
      iterations,
      targetHeight,
      newCameraHeight,
    );
    camera.setView({
      destination: Cartesian3.fromRadians(lngRad, latRad, newCameraHeight),
    });
    const newResolution = getScenePixelSize(viewer).value;
    if (newResolution === null) {
      return false;
    }
    currentPixelResolution = newResolution;
    iterations++;
  }
  viewer.scene.requestRender();
  //console.log('zoom iterations', iterations);
  onComplete && onComplete();
  return true; // Return true if camera position found within max iterations
};
