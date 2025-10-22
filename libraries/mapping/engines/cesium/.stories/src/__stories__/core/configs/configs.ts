import type { CesiumConfig } from "@carma-mapping/engines/cesium/core";
import type { ScreenSpaceCameraController } from "cesium";
import { BLANK_GLOBE_STYLE } from "./styles/blank";
import { MESH_LOD2_STYLE } from "./styles/mesh-lod2";
import { Cartesian3 } from "cesium";
import { WUPPERTAL } from "@carma/resources";

/**
 * Wuppertal center point (Cartesian3) - what we're looking AT
 */
export const WUPPERTAL_CENTER = Cartesian3.fromDegrees(
  WUPPERTAL.position.longitude,
  WUPPERTAL.position.latitude,
  WUPPERTAL.position.altitude
);

/**
 * Camera orientation relative to target
 * HeadingPitchRange - target-centric (looking AT the target)
 */
export const WUPPERTAL_HOME_HPR = {
  heading: 0, // View from north (0 = north)
  pitch: -0.785, // ~45° down (good overview angle)
  range: 600, // 8km from target (city overview)
};

/**
 * Standard camera controller settings
 */
export const DEFAULT_CAMERA_CONTROLLER = {
  enableCollisionDetection: true,
  maximumZoomDistance: 50000,
  minimumZoomDistance: 100,
};

const DEFAULT_INITIAL_CAMERA = {
  target: WUPPERTAL_CENTER,
  orientation: WUPPERTAL_HOME_HPR,
};

/**
 * Base config with all available providers
 * Providers are only loaded when referenced in scene styles
 */
export const BASE_WUPPERTAL_CONFIG: Partial<CesiumConfig> = {
  baseUrl: "/cesium",
  initialCamera: DEFAULT_INITIAL_CAMERA,
  screenSpaceCameraController: DEFAULT_CAMERA_CONTROLLER,
};

export const BLANK_SCENE_CONFIG: CesiumConfig = {
  ...BASE_WUPPERTAL_CONFIG,
  sceneStyle: BLANK_GLOBE_STYLE,
};

export const STANDARD_SCENE_CONFIG: CesiumConfig = {
  ...BASE_WUPPERTAL_CONFIG,
  sceneStyle: MESH_LOD2_STYLE,
};
