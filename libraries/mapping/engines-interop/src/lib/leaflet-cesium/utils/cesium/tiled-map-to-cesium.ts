// WEB MAPS TO CESIUM
import {
  Cartographic,
  Cartesian2,
  Cartesian3,
  type CesiumTerrainProvider,
  type Scene,
  isValidScene,
  PerspectiveFrustum,
} from "@carma/cesium";

import type { LatLng, Zoom } from "@carma/types";
import { normalizeOptions } from "@carma-commons/utils";
import { degToRad, isZoom } from "@carma-commons/units/helpers";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";

import { calculateCameraDistance } from "./camera-distance";
import { applyElevationToPosition } from "./apply-elevation";
import {
  type TransitionOptions,
  defaultTransitionOptions,
} from "./elevation-reference";

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

  const { onComplete, fallbackHeight, preferredElevationReference } =
    normalizeOptions(options, defaultTransitionOptions);

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

  console.log("[CESIUM|TRANSITION] === Camera Distance Calculation ===");
  console.log("[CESIUM|TRANSITION] Leaflet zoom:", zoom);
  console.log("[CESIUM|TRANSITION] Latitude:", latitude);
  console.log(
    "[CESIUM|TRANSITION] Computed distance (above ground):",
    computedDistance,
    "m"
  );

  console.log(
    "[CESIUM|TRANSITION] Initial ground position fallback height:",
    fallbackHeight,
    "m"
  );

  // Apply elevation data (non-blocking) - returns updated position
  const cameraGroundPosition = await applyElevationToPosition(
    terrainProviders,
    Cartographic.fromRadians(lngRad, latRad, fallbackHeight),
    preferredElevationReference,
    fallbackHeight
  );

  console.log(
    "[CESIUM|TRANSITION] Terrain elevation at position:",
    cameraGroundPosition.height,
    "m"
  );

  if (!scene) {
    console.warn("[CESIUM|TRANSITION] No scene available for transition");
    return false;
  }

  // CRITICAL: Only add the computed distance (above ground) to terrain elevation
  // Previously we were adding to total elevation which was incorrect
  const cameraDestinationCartographic = cameraGroundPosition.clone();
  cameraDestinationCartographic.height += computedDistance;

  console.log("[CESIUM|TRANSITION] === Final Camera Position ===");
  console.log(
    "[CESIUM|TRANSITION] Terrain elevation:",
    cameraGroundPosition.height,
    "m"
  );
  console.log(
    "[CESIUM|TRANSITION] Distance above ground:",
    computedDistance,
    "m"
  );
  console.log(
    "[CESIUM|TRANSITION] Final camera elevation:",
    cameraDestinationCartographic.height,
    "m"
  );

  const destination = Cartographic.toCartesian(cameraDestinationCartographic);

  window.requestAnimationFrame(() => {
    scene.camera.setView({ destination });

    // DEBUG: Compare pixel resolutions after camera positioning
    // This is NOT part of transition logic, just for debugging
    window.requestAnimationFrame(() => {
      const { drawingBufferHeight, drawingBufferWidth } = scene;
      const centerX = drawingBufferWidth / 2;
      const centerY = drawingBufferHeight / 2;

      // Pick terrain at screen center
      const pickRay = scene.camera.getPickRay(new Cartesian2(centerX, centerY));
      if (pickRay) {
        const globe = scene.globe;
        if (globe) {
          const pickedPosition = globe.pick(pickRay, scene);
          if (pickedPosition) {
            const cameraPosition = scene.camera.positionCartographic;
            const pickedCartographic =
              Cartographic.fromCartesian(pickedPosition);

            // Calculate distance from camera to picked point
            const distance = Cartesian3.distance(
              scene.camera.position,
              pickedPosition
            );

            console.log(
              "[CESIUM|TRANSITION] === DEBUG: Pixel Resolution Check ==="
            );
            console.log(
              "[CESIUM|TRANSITION] Camera elevation:",
              cameraPosition.height.toFixed(1),
              "m"
            );
            console.log(
              "[CESIUM|TRANSITION] Picked terrain elevation:",
              pickedCartographic.height.toFixed(1),
              "m"
            );
            console.log(
              "[CESIUM|TRANSITION] Distance to ground (picked):",
              distance.toFixed(1),
              "m"
            );

            // Get actual pixel dimensions at the picked distance
            const camera = scene.camera;
            if (camera.frustum instanceof PerspectiveFrustum) {
              const fov = camera.frustum.fov;
              const tanHalfFov = Math.tan(fov / 2);
              const pixelResolution =
                (2 * distance * tanHalfFov) /
                (drawingBufferHeight * resolutionScale);

              console.log(
                "[CESIUM|TRANSITION] FOV:",
                ((fov * 180) / Math.PI).toFixed(1),
                "deg"
              );
              console.log(
                "[CESIUM|TRANSITION] Drawing buffer:",
                drawingBufferWidth,
                "×",
                drawingBufferHeight
              );
              console.log(
                "[CESIUM|TRANSITION] Resolution scale:",
                resolutionScale
              );
              console.log(
                "[CESIUM|TRANSITION] Actual pixel resolution (from picking):",
                pixelResolution.toFixed(4),
                "m/px"
              );

              // Calculate expected pixel resolution from zoom
              const expectedPixelResolution =
                getPixelResolutionFromZoomAtLatitudeRad(zoom, latRad);
              console.log(
                "[CESIUM|TRANSITION] Expected pixel resolution (from zoom):",
                expectedPixelResolution.toFixed(4),
                "m/px"
              );
              console.log(
                "[CESIUM|TRANSITION] Difference:",
                (
                  ((pixelResolution - expectedPixelResolution) /
                    expectedPixelResolution) *
                  100
                ).toFixed(1),
                "%"
              );
            }
          }
        }
      }
    });
  });

  // COMMENTED OUT: Iterative adjustment loop that used picker for ground height
  // Now using terrain providers for elevation directly via applyElevationToPosition
  /*
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
  */

  scene.requestRender();
  onComplete?.();
  return true;
};
