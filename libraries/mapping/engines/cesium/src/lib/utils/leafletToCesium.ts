// WEB MAPS TO CESIUM
import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  sampleTerrainMostDetailed,
  TerrainProvider,
  Viewer,
} from "cesium";
import type { Map as LeafletMap } from "leaflet";

import {
  getCameraHeightAboveGround,
  getPixelResolutionFromZoomAtLatitude,
  getScenePixelSize,
} from "./cesiumHelpers";
import { isLeafletZoomValid } from "./leafletHelpers";
import { getCesiumCameraPixelDimensionForDistance } from "./cesiumCamera";

export const leafletToCesium = async (
  leaflet: LeafletMap,
  viewer: Viewer,
  {
    epsilon = 0.5,
    limit = 5,
    cause = "not specified",
    surfaceProvider,
    terrainProvider,
    onComplete,
    fallbackHeight = 150, // min height for local terrain
  }: {
    epsilon?: number;
    limit?: number;
    cause?: string;
    onComplete?: Function;
    surfaceProvider: TerrainProvider | null;
    terrainProvider: TerrainProvider | null;
    fallbackHeight?: number;
  },
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

  const computedDistance = START_DISTANCE * resolutionRatio;

  let currentPixelResolution = getScenePixelSize(viewer).value;

  if (currentPixelResolution === null) {
    console.warn("No pixel size found for camera position");
    return false;
  }

  const { camera } = viewer;

  const cameraGroundPosition = Cartographic.fromRadians(
    lngRad,
    latRad,
    fallbackHeight,
  );

  if (surfaceProvider) {
    const [surfaceSample] = await sampleTerrainMostDetailed(surfaceProvider, [
      cameraGroundPosition,
    ]);
    console.log("surfaceSample", surfaceSample, cameraGroundPosition);
  } else if (terrainProvider) {
    const [terrainSample] = await sampleTerrainMostDetailed(terrainProvider, [
      Cartographic.fromRadians(lngRad, latRad),
    ]);
    console.log("terrainSample", terrainSample, cameraGroundPosition);
  } else {
    console.info(
      "no surface or terrain provider available, using fallback height",
    );
  }

  const cameraDestinationCartographic = cameraGroundPosition.clone();
  cameraDestinationCartographic.height += computedDistance;

  const destination = Cartographic.toCartesian(cameraDestinationCartographic);

  console.info(
    `L2C [2D3D|CESIUM|CAMERA] cause: ${cause} lat: ${lat} lng: ${lng} z: ${zoom}`,
  );
  console.log("L2C [2D3D|CESIUM|CAMERA] destination", destination);
  console.log(
    "L2C [2D3D|CESIUM|CAMERA] cameraDestinationCartographic",
    cameraDestinationCartographic.height,
  );
  console.log(
    "L2C [2D3D|CESIUM|CAMERA] cameraGroundPosition",
    cameraGroundPosition.height,
  );
  console.log("L2C [2D3D|CESIUM|CAMERA] computedDistance", computedDistance);

  window.requestAnimationFrame(() => {
    camera.setView({ destination });
  });

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
      console.log("L2C [2D3D] iterate", iterations, cameraPositionAtStart);
      camera.setView({ destination: cameraPositionAtStart });
      return false;
    }
    const adjustmentFactor = targetPixelResolution / currentPixelResolution;
    cameraHeightAboveGround *= adjustmentFactor;
    const newCameraHeight = cameraHeightAboveGround + groundHeight;

    const updatedCameraDestinationCartographic = Cartographic.fromRadians(
      lngRad,
      latRad,
      newCameraHeight,
    );
    const updatedDestination = Cartographic.toCartesian(
      updatedCameraDestinationCartographic,
    );

    console.log(
      "L2C [2D3D|CESIUM|CAMERA] setview",
      iterations,
      newCameraHeight,
      updatedDestination,
    );
    camera.setView({
      destination: updatedDestination,
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
