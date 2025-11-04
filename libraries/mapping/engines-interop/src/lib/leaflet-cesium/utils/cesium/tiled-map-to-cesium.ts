// WEB MAPS TO CESIUM
import {
  Cartographic,
  type CesiumTerrainProvider,
  type Scene,
} from "@carma/cesium";

import type { LatLng, Zoom } from "@carma/types";
import { normalizeOptions } from "@carma-commons/utils";
import { degToRad, isZoom } from "@carma-commons/units/helpers";

import { calculateCameraDistance } from "./camera-distance";
import { applyElevationToPosition } from "./apply-elevation";
import {
  type TransitionOptions,
  defaultTransitionOptions,
} from "./elevation-reference";
import { isValidScene } from "libraries/mapping/engines/cesium/legacy/src/lib/utils/instanceGates";
import { getCameraHeightAboveGround } from "./get-camera-height-above-ground";
import { getScenePixelSize } from "libraries/mapping/engines/cesium/legacy/src/lib/utils/pixels";

export const tiledMapToCesium = async (
  scene: Scene,
  terrainProviders: {
    terrain?: CesiumTerrainProvider;
    surface?: CesiumTerrainProvider;
  },
  resolutionScale: number,
  { latitude, longitude }: LatLng.deg,
  zoom: Zoom,
  options: TransitionOptions
): Promise<boolean> => {
  if (!isValidScene(scene)) {
    console.warn("[CESIUM|TRANSITION] No viewer available for transition");
    return false;
  }

  if (!isZoom(zoom)) {
    console.warn("[CESIUM|TRANSITION] No zoom level available for transition");
    return false;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.warn(
      "[CESIUM|TRANSITION] No valid coordinates available for transition",
      latitude,
      longitude
    );
    return false;
  }

  const lngRad = degToRad(longitude);
  const latRad = degToRad(latitude);

  const {
    epsilon,
    limit,
    cause,
    onComplete,
    fallbackHeight,
    preferredElevationReference,
  } = normalizeOptions(options, defaultTransitionOptions);

  // Calculate camera distance based on zoom and latitude
  const computedDistance = calculateCameraDistance(
    scene,
    resolutionScale,
    latitude,
    zoom
  );

  if (computedDistance === null) {
    console.warn("[CESIUM|TRANSITION] Failed to calculate camera distance");
    return false;
  }

  let currentPixelResolution = getScenePixelSize(scene).value;

  if (currentPixelResolution === null) {
    console.warn("[CESIUM|TRANSITION] No pixel size found for camera position");
    return false;
  }

  // Initialize ground position with fallback height
  const cameraGroundPosition = Cartographic.fromRadians(
    lngRad,
    latRad,
    fallbackHeight
  );

  // Apply elevation data (non-blocking)
  await applyElevationToPosition(
    terrainProviders,
    cameraGroundPosition,
    preferredElevationReference,
    fallbackHeight
  );

  if (!scene) {
    console.warn("[CESIUM|TRANSITION] No scene available for transition");
    return false;
  }

  const cameraDestinationCartographic = cameraGroundPosition.clone();
  cameraDestinationCartographic.height += computedDistance;

  const destination = Cartographic.toCartesian(cameraDestinationCartographic);

  console.debug(
    `[CESIUM|TRANSITION] cause: ${cause} lat: ${latitude} lng: ${longitude} z: ${zoom}`
  );
  console.debug("[CESIUM|TRANSITION] destination", destination);
  console.debug(
    "[CESIUM|TRANSITION] cameraDestinationCartographic height",
    cameraDestinationCartographic.height
  );
  console.debug(
    "[CESIUM|TRANSITION] cameraGroundPosition height",
    cameraGroundPosition.height
  );
  console.debug("[CESIUM|TRANSITION] computedDistance", computedDistance);

  window.requestAnimationFrame(() => {
    scene.camera.setView({ destination });
  });

  let isQualifiedResult = true;
  let { cameraHeightAboveGround, groundHeight } =
    getCameraHeightAboveGround(scene);
  const maxIterations = limit;
  let iterations = 0;

  if (currentPixelResolution === null) {
    console.warn("[CESIUM|TRANSITION] No pixel size found for camera position");
    return false;
  }

  // Get target pixel resolution for comparison
  const targetPixelResolution = getScenePixelSize(scene).value;
  if (targetPixelResolution === null) {
    console.warn(
      "[CESIUM|TRANSITION] No target pixel resolution for comparison"
    );
    return false;
  }

  let currentError = Math.abs(currentPixelResolution - targetPixelResolution);

  // Iterative adjustment to match the target resolution
  while (isQualifiedResult && currentError > epsilon) {
    if (iterations >= maxIterations) {
      console.warn(
        "[CESIUM|TRANSITION] Maximum height finding iterations reached with no result, using best result."
      );
      console.debug(
        "[CESIUM|TRANSITION] iterate",
        iterations,
        maxIterations,
        epsilon,
        currentError,
        currentPixelResolution,
        targetPixelResolution
      );
      isQualifiedResult = false;
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
      "[CESIUM|TRANSITION] setview iteration",
      iterations,
      newCameraHeight
    );
    scene.camera.setView({
      destination: updatedDestination,
    });
    const newResolution = getScenePixelSize(scene).value;
    if (newResolution === null) {
      return false;
    }
    currentPixelResolution = newResolution;
    currentError = Math.abs(currentPixelResolution - targetPixelResolution);
    iterations++;
  }
  scene.requestRender();
  onComplete?.();
  return true;
};
