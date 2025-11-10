// WEB MAPS TO CESIUM
import {
  Cartographic,
  Cartesian3,
  type CesiumTerrainProvider,
  type Scene,
  isValidScene,
} from "@carma/cesium";

import type { LeafletView } from "@carma/leaflet";
import { normalizeOptions } from "@carma-commons/utils";
import type { Degrees } from "@carma/units/types";
import { degToRad, isZoom } from "@carma/units/helpers";

import { calculateCameraDistance } from "./cesium/camera-distance";
import { applyElevationToPosition } from "./cesium/apply-elevation";
import {
  type TransitionOptions,
  defaultTransitionOptions,
} from "./cesium/elevation-reference";

export const tiledMapToCesium = async (
  scene: Scene,
  terrainProviders: {
    terrain?: CesiumTerrainProvider;
    surface?: CesiumTerrainProvider;
  },
  resolutionScale: number,
  view: LeafletView,
  options: TransitionOptions
): Promise<{ success: boolean; groundPosition: Cartesian3 | null }> => {
  if (!isValidScene(scene)) {
    console.warn("[CESIUM|TRANSITION] No viewer available for transition");
    return { success: false, groundPosition: null };
  }

  const { center, zoom } = view;
  const { lat, lng } = center;

  if (!isZoom(zoom)) {
    console.warn("[CESIUM|TRANSITION] No zoom level available for transition");
    return { success: false, groundPosition: null };
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn(
      "[CESIUM|TRANSITION] No valid coordinates available for transition",
      lat,
      lng
    );
    return { success: false, groundPosition: null };
  }

  const lngRad = degToRad(lng as Degrees);
  const latRad = degToRad(lat as Degrees);

  const { onComplete, fallbackHeight, preferredElevationReference } =
    normalizeOptions(options, defaultTransitionOptions);

  // Calculate camera distance based on zoom and latitude
  const computedDistance = calculateCameraDistance(
    scene,
    resolutionScale,
    lat as Degrees,
    zoom
  );

  if (computedDistance === null) {
    console.warn("[CESIUM|TRANSITION] Failed to calculate camera distance");
    return { success: false, groundPosition: null };
  }

  console.log("[CESIUM|TRANSITION] === Camera Distance Calculation ===");
  console.log("[CESIUM|TRANSITION] Leaflet zoom:", zoom);
  console.log("[CESIUM|TRANSITION] Latitude:", lat as Degrees);
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
    return { success: false, groundPosition: null };
  }

  // Convert ground position to Cartesian3 for camera rotation
  const groundPosition = Cartographic.toCartesian(cameraGroundPosition);

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

  //window.requestAnimationFrame(() => {
  scene.camera.setView({ destination });
  //});

  scene.requestRender();
  onComplete?.();
  return { success: true, groundPosition };
};
