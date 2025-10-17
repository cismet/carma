import { CameraLookAtOptions } from "../camera";
import { SceneStyleConfig } from "./scene-style";
import {
  type CesiumWidget,
  type CesiumScreenSpaceCameraController,
  type Globe,
} from "cesium";

/** Marker should be handled by the marker plugin
// MARKERS
export type {
  MarkerData,
  Marker3dData,
  MarkerPrimitiveData,
  MarkerModelAsset,
  ParsedMarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
} from "./lib/extensions/markers";
*/

export type CesiumConfig = {
  // Core Cesium configuration - pass through to Cesium constructors
  options?: CesiumWidget.ConstructorOptions;
  screenSpaceCameraController?: CesiumScreenSpaceCameraController.ConstructorOptions;
  globe?: Globe.ConstructorOptions;

  // CARMA scene management
  sceneStyles?: SceneStyleConfig[]; // First style is always initial

  // Camera/home position (CARMA extensions)
  initialCameraLookAt?: CameraLookAtOptions;
  // Legacy fields (TODO: evaluate removal)
  /* TRANSITIONS
  not handled by the viewer itself
  transitions?: {
    mapMode: { duration: number };
  };
  */

  /* CAMERA
  move to limiter plugin
  camera?: {
    minPitch: number;
    minPitchRange: number;
  };
  */

  // TODO: Migrate to plugin system
  /* MARKERS
  markerKey?: string;
  markerAnchorHeight?: number;
  markers?: CesiumMarkerOptions[];
  models?: ModelConfig[];
  modelAssets?: Record<string, MarkerModelAsset | ParsedMarkerModelAsset>;
  */
};
