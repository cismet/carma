// WEB MAPS TO CESIUM
import { Cartographic, Math as CesiumMath } from "cesium";

import type { LatLng, Zoom } from "@carma/types";

import { normalizeOptions, isZoom } from "@carma-commons/utils";

import type { CesiumContextType } from "../../CesiumContext";

import { getCameraHeightAboveGround } from "../cesiumHelpers";
import { getScenePixelSize } from "../pixels";

import { calculateCameraDistance } from "./cameraDistance";
import { applyElevationToPosition } from "./applyElevation";
import {
  type TransitionOptions,
  defaultTransitionOptions,
} from "./elevationReference";

/**
 * Transitions a web map to a Cesium camera position.
 *
 * @param ctx - The Cesium context.
 * @param {LatLng.deg} { lat, lng } - The latitude and longitude of the center of the web map in degrees.
 * @param {Zoom} zoom - The zoom level of the web map.
 * @param {Object} options - The options for the transition.
 * @param {number} options.epsilon - The epsilon value (permitted error) for the target pixel resolution.
 * @param {number} options.limit - The iteration limit for getting the camera position.
 * @param {string} options.cause - The cause of the transition.
 * @param {Function} options.onComplete - The callback function to be called when the transition is complete.
 * @param {number} options.fallbackHeight - The fallback height for the transition.
 * @param {PreferredHeight} options.preferredHeight - The preferred height for the transition.
 * @returns {Promise<boolean>} - A promise that resolves to true if the transition was successful, false otherwise.
 */

export const tiledMapToCesium = async (
  ctx: CesiumContextType,
  { latitude, longitude }: LatLng.deg,
  zoom: Zoom,
  options: TransitionOptions
): Promise<boolean> => {
  if (!ctx.isValidViewer()) {
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

  const lngRad = CesiumMath.toRadians(longitude);
  const latRad = CesiumMath.toRadians(latitude);

  const {
    epsilon,
    limit,
    cause,
    onComplete,
    fallbackHeight,
    preferredElevationReference,
  } = normalizeOptions(options, defaultTransitionOptions);

  // Calculate camera distance based on zoom and latitude
  const computedDistance = calculateCameraDistance(ctx, latitude, zoom);

  if (computedDistance === null) {
    console.warn("[CESIUM|TRANSITION] Failed to calculate camera distance");
    return false;
  }

  let currentPixelResolution = getScenePixelSize(ctx).value;

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
    ctx,
    cameraGroundPosition,
    preferredElevationReference,
    fallbackHeight
  );

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
    ctx.withCamera((camera) => {
      camera.setView({ destination });
    });
  });

  let isQualifiedResult = true;
  let { cameraHeightAboveGround, groundHeight } =
    getCameraHeightAboveGround(ctx);
  const maxIterations = limit;
  let iterations = 0;

  if (currentPixelResolution === null) {
    console.warn("[CESIUM|TRANSITION] No pixel size found for camera position");
    return false;
  }

  // Get target pixel resolution for comparison
  const targetPixelResolution = getScenePixelSize(ctx).value;
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
    currentError = Math.abs(currentPixelResolution - targetPixelResolution);
    iterations++;
  }
  ctx.requestRender();
  onComplete?.();
  return true;
};
