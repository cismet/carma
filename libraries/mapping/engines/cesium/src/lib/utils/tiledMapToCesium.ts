// WEB MAPS TO CESIUM
import {
  Cartographic,
  type CesiumTerrainProvider,
  Math as CesiumMath,
  type Viewer,
} from "cesium";

import type { LatLng, Zoom } from "@carma/types";

import {
  asRadians,
  getPixelResolutionFromZoomAtLatitudeRad,
  normalizeOptions,
  isZoom,
} from "@carma-commons/utils";

import { isValidViewer } from "./instanceGates";
import { getCesiumFrustumPixelDimensionsForDistance } from "./cesiumCamera";
import { getCameraHeightAboveGround } from "./cesiumHelpers";
import { getElevationAsync } from "./elevation";
import { getScenePixelSize } from "./pixels";
import type { WithElevationProvidersAsyncCallback } from "../hooks/useValidInstances";

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
  withElevationProvidersAsync: WithElevationProvidersAsyncCallback,
  { latitude, longitude }: LatLng.deg,
  zoom: Zoom,
  options: TransitionOptions
): Promise<boolean> => {
  let result = false;
  withElevationProvidersAsync(
    async (terrainProvider, surfaceProvider, viewer) => {
      const { scene } = viewer;
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

      const lngRad = CesiumMath.toRadians(longitude);
      const latRad = CesiumMath.toRadians(latitude);

      const targetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
        zoom,
        asRadians(latRad)
      );

      const {
        epsilon,
        limit,
        cause,
        onComplete,
        fallbackHeight,
        preferredElevationReference,
      } = normalizeOptions(options, defaultTransitionOptions);

      const resolutionScale = viewer.resolutionScale;

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

      const resolutionRatio =
        targetPixelResolution / baseComputedPixelResolution;

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

      const [elevation] = await getElevationAsync(
        surfaceProvider,
        terrainProvider,
        [cameraGroundPosition]
      );

      if (!elevation) {
        console.warn("No elevation found for camera position");
        return;
      }

      const { terrain, surface } = elevation;

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

      const destination = Cartographic.toCartesian(
        cameraDestinationCartographic
      );

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
        if (!isValidViewer(viewer)) return;
        try {
          viewer.scene.camera.setView({ destination });
        } catch (e) {
          console.error("setting view for cesium elevation failed");
        }
      });
      let isQualifiedResult = true;
      let { cameraHeightAboveGround, groundHeight } =
        getCameraHeightAboveGround(viewer);
      const maxIterations = limit;
      let iterations = 0;

      if (currentPixelResolution === null) {
        console.warn("No pixel size found for camera position");
        return;
      }

      let currentError = Math.abs(
        currentPixelResolution - targetPixelResolution
      );

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
    }
  );
  return result;
};
