// WEB MAPS TO CESIUM
import { Cartographic, Math as CesiumMath } from "cesium";

import type { LatLng, Zoom } from "@carma/types";

import {
  asRadians,
  getPixelResolutionFromZoomAtLatitudeRad,
  normalizeOptions,
  isZoom,
} from "@carma-commons/utils";

import type { CesiumContextType } from "../CesiumContext";

import { getCesiumCameraPixelDimensionForDistance } from "./cesiumCamera";
import { getCameraHeightAboveGround } from "./cesiumHelpers";
import { getElevationAsync } from "./elevation";
import { getScenePixelSize } from "./pixels";

// TODO: move to config or formalize the starting distance value
const START_DISTANCE = 1000;

type TransitionOptions = {
  epsilon?: number;
  limit?: number;
  cause?: string;
  onComplete?: Function;
  fallbackHeight?: number;
};

const noop = () => {};

const defaultTransitionOptions: Required<TransitionOptions> = {
  epsilon: 0.05,
  limit: 5,
  cause: "not specified",
  onComplete: noop,
  fallbackHeight: 150,
};

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
 * @returns {Promise<boolean>} - A promise that resolves to true if the transition was successful, false otherwise.
 */

export const tiledMapToCesium = async (
  ctx: CesiumContextType,
  { latitude, longitude }: LatLng.deg,
  zoom: Zoom,
  options: TransitionOptions
) => {
  if (!ctx.isValidViewer()) {
    console.warn("No viewer available for transition");
    return false;
  }

  if (!isZoom(zoom)) {
    console.warn("No zoom level available for transition");
    return false;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.warn(
      "No valid coordinates available for transition",
      latitude,
      longitude
    );
    return false;
  }

  const lngRad = CesiumMath.toRadians(longitude);
  const latRad = CesiumMath.toRadians(latitude);

  const targetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    asRadians(latRad)
  );

  const { epsilon, limit, cause, onComplete, fallbackHeight } =
    normalizeOptions(options, defaultTransitionOptions);

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
    `L2C [2D3D|CESIUM|CAMERA] cause: ${cause} lat: ${latitude} lng: ${longitude} z: ${zoom}`
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
  onComplete?.();
  return true; // Return true if camera position found within max iterations
};
