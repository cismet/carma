import {
  Cartesian3,
  Cartographic,
  CesiumTerrainProvider,
  defined,
  type Scene,
} from "@carma/cesium";
import type { Altitude } from "@carma/geo/types";
import { pickSceneCanvasCenter } from "@carma-mapping/engines/cesium/legacy";
import { getCameraHeightAboveGroundAsync } from "./get-camera-height-above-ground";

export type GroundPositionResult = {
  groundPos: Cartesian3;
  cartographic: Cartographic;
  distance: number;
  height: number;
};

const DEFAULT_FALLBACK_HEIGHT = 200 as Altitude.EllipsoidalWGS84Meters;

export const getGroundPosition = async (
  scene: Scene,
  terrainProvider: CesiumTerrainProvider,
  fallbackHeight: Altitude.EllipsoidalWGS84Meters = DEFAULT_FALLBACK_HEIGHT
): Promise<GroundPositionResult | null> => {
  const { camera } = scene;
  let groundPos: Cartesian3;
  let cartographic: Cartographic;

  try {
    // CRITICAL: Disable pickTranslucentDepth during transitions
    // It requires valid framebuffers which may be destroyed mid-operation
    // causing "destroyed object" errors. Terrain-only picking is sufficient.
    const centerPickResult = pickSceneCanvasCenter(
      scene,
      "GET_GROUND_POSITION",
      {
        depthTestAgainstTerrain: true,
        getCoordinates: true,
        pickTranslucentDepth: false, // Disable to prevent framebuffer issues during transitions
      }
    );

    // Check if picking succeeded before using the values
    if (
      defined(centerPickResult.scenePosition) &&
      defined(centerPickResult.coordinates)
    ) {
      groundPos = centerPickResult.scenePosition;
      cartographic = centerPickResult.coordinates;
    } else {
      // Picking returned null values, use fallback
      throw new Error("Picking returned null position");
    }
  } catch (error) {
    console.warn(
      "[CESIUM] error during pickSceneCanvasCenter, using fallback",
      error
    );
    let elevation = fallbackHeight;
    try {
      elevation = (
        await getCameraHeightAboveGroundAsync(scene, terrainProvider)
      ).groundHeight as Altitude.EllipsoidalWGS84Meters;
    } catch (error) {
      console.warn(
        "[CESIUM] error during getCameraHeightAboveGroundAsync, using fallback",
        error
      );
    }
    const groundPosCarto = camera.positionCartographic.clone();
    groundPosCarto.height = elevation;
    groundPos = Cartographic.toCartesian(groundPosCarto);
    cartographic = groundPosCarto;

    console.debug("[CESIUM] Fallback ground position computed:", {
      groundPosCarto: {
        longitude: groundPosCarto.longitude,
        latitude: groundPosCarto.latitude,
        height: groundPosCarto.height,
      },
      groundPosIsDefined: defined(groundPos),
      cartographicIsDefined: defined(cartographic),
    });
  }

  if (!defined(groundPos) || !defined(cartographic)) {
    return null;
  }

  const distance = Cartesian3.distance(groundPos, camera.position);
  const height = cartographic.height + distance;

  return { groundPos, cartographic, distance, height };
};
