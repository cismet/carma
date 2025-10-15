// WEB MAPS TO CESIUM
import { Cartographic } from "cesium";

import type { Zoom } from "@carma/types";
import type { LatLng } from "@carma/geo/types";
import type { Radians, Degrees } from "@carma/units/types";

import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import { isZoom, degToRad } from "@carma-commons/units/helpers";
import { normalizeOptions } from "@carma-commons/utils";

// Import utilities from cesium engine
import {
  tryWithValidScene,
  getCesiumFrustumPixelDimensionsForDistance,
  getCameraHeightAboveGround,
  getElevationAsync,
  getScenePixelSize,
} from "@carma-mapping/engines/cesium";

// TODO: move to config or formalize the starting distance value
const START_DISTANCE = 1000;

export enum ElevationReference {
  SURFACE = "surface",
  TERRAIN = "terrain",
}

type TransitionOptions = {
  epsilon?: number;
  limit?: number;
  cause?: string;
  onComplete?: Function;
  fallbackHeight?: number;
  preferredElevationReference?: ElevationReference;
};

const noop = () => {};

const defaultTransitionOptions: Required<TransitionOptions> = {
  epsilon: 0.1,
  limit: 20,
  cause: "not specified",
  onComplete: noop,
  fallbackHeight: 350,
  preferredElevationReference: ElevationReference.SURFACE,
};

export const tiledMapToCesium = async (
  { latitude, longitude }: LatLng.deg,
  zoom: Zoom,
  resolutionScale: number,
  options: TransitionOptions
): Promise<boolean> => {
  let result = false;
  async (terrainProvider, surfaceProvider, scene) => {
    const { camera } = scene;

    if (!isZoom(zoom)) {
      console.warn("No zoom level available for transition");
      return;
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      console.warn(
        "No valid coordinates available for transition",
        latitude,
        longitude
      );
      return;
    }

    const lngRad = degToRad(longitude as Degrees);
    const latRad = degToRad(latitude as Degrees);

    const targetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latRad as Radians
    );

    const {
      epsilon,
      limit,
      cause,
      onComplete,
      fallbackHeight,
      preferredElevationReference,
    } = normalizeOptions(options, defaultTransitionOptions);

    const baseComputedPixelResolution =
      getCesiumFrustumPixelDimensionsForDistance(
        scene,
        resolutionScale,
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
      return;
    }

    const resolutionRatio = targetPixelResolution / baseComputedPixelResolution;

    const computedDistance = START_DISTANCE * resolutionRatio;

    let currentPixelResolution: number | null = null;
    currentPixelResolution = getScenePixelSize(scene).value;

    if (currentPixelResolution === null) {
      console.warn("No pixel size found for camera position");
      return;
    }

    const cameraGroundPosition = Cartographic.fromRadians(
      lngRad,
      latRad,
      fallbackHeight
    );

    let terrain, surface;
    try {
      const results = await getElevationAsync(
        surfaceProvider,
        terrainProvider,
        [cameraGroundPosition]
      );
      const elevation = results[0];
      if (!elevation) {
        throw new Error("No elevation result returned");
      }
      terrain = elevation.terrain;
      surface = elevation.surface;
    } catch (error) {
      console.warn("Failed to get elevation for camera position", error);
      return;
    }

    if (
      preferredElevationReference === ElevationReference.TERRAIN &&
      terrain?.height !== undefined
    ) {
      cameraGroundPosition.height = terrain.height;
      console.debug(
        "L2C [2D3D|CESIUM|CAMERA] terrain height applied",
        terrain.height
      );
    } else if (
      preferredElevationReference === ElevationReference.SURFACE &&
      surface?.height !== undefined
    ) {
      cameraGroundPosition.height = surface.height;
      console.debug(
        "L2C [2D3D|CESIUM|CAMERA] surface height applied",
        surface.height
      );
    } else {
      cameraGroundPosition.height =
        surface?.height ?? terrain?.height ?? fallbackHeight;
      console.debug(
        "L2C [2D3D|CESIUM|CAMERA] best available height applied",
        cameraGroundPosition.height,
        surface?.height,
        terrain?.height,
        fallbackHeight
      );
    }

    const cameraDestinationCartographic = cameraGroundPosition.clone();
    cameraDestinationCartographic.height += computedDistance;

    const destination = Cartographic.toCartesian(cameraDestinationCartographic);

    if (
      !destination ||
      !Number.isFinite(destination.x) ||
      !Number.isFinite(destination.y) ||
      !Number.isFinite(destination.z)
    ) {
      console.error(
        "[TRANSITION|ERROR] Invalid destination calculated:",
        destination
      );
      throw new Error("Invalid camera destination - contains NaN or Infinity");
    }

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
    console.debug(
      "L2C [2D3D|CESIUM|CAMERA] computedDistance",
      computedDistance
    );

    window.requestAnimationFrame(() => {
      tryWithValidScene(scene, () => {
        scene.camera.setView({ destination });
      });
    });
    let isQualifiedResult = true;
    let { cameraHeightAboveGround, groundHeight } =
      getCameraHeightAboveGround(scene);
    const maxIterations = limit;
    let iterations = 0;

    if (currentPixelResolution === null) {
      console.warn("No pixel size found for camera position");
      return;
    }

    let currentError = Math.abs(currentPixelResolution - targetPixelResolution);

    // Iterative adjustment to match the target resolution
    while (isQualifiedResult && currentError > epsilon) {
      if (iterations >= maxIterations) {
        console.warn(
          "Maximum height finding iterations reached with no result, using best result."
        );
        console.debug(
          "L2C [2D3D] iterate",
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

      if (!Number.isFinite(newCameraHeight)) {
        console.error(
          "[TRANSITION|ERROR] Invalid camera height calculated:",
          newCameraHeight
        );
        throw new Error("Invalid camera height - NaN or Infinity");
      }

      const updatedCameraDestinationCartographic = Cartographic.fromRadians(
        lngRad,
        latRad,
        newCameraHeight
      );
      const updatedDestination = Cartographic.toCartesian(
        updatedCameraDestinationCartographic
      );

      if (
        !updatedDestination ||
        !Number.isFinite(updatedDestination.x) ||
        !Number.isFinite(updatedDestination.y) ||
        !Number.isFinite(updatedDestination.z)
      ) {
        console.error(
          "[TRANSITION|ERROR] Invalid updated destination:",
          updatedDestination
        );
        throw new Error(
          "Invalid updated camera destination - contains NaN or Infinity"
        );
      }

      console.debug(
        "L2C [2D3D|CESIUM|CAMERA] setview",
        iterations,
        newCameraHeight
      );
      camera.setView({
        destination: updatedDestination,
      });
      let newResolution: number | null = null;
      newResolution = getScenePixelSize(scene).value;

      currentPixelResolution = newResolution;
      if (currentPixelResolution === null) {
        return;
      }
      currentError = Math.abs(currentPixelResolution - targetPixelResolution);
      iterations++;
    }
    scene.requestRender();
    onComplete?.();
    result = true;
  };
  return result;
};
