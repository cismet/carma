import { SceneStyleConfig } from "./scene-style";
import {
  type CesiumWidget,
  type CesiumScreenSpaceCameraController,
  type Globe,
  type CameraPoseRadians,
} from "@carma/cesium";

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
  // Views and Home Camera are consumer app settings, config just provides scene setup and styles
  // Runtime asset paths (REQUIRED)
  baseUrl?: string; // Base URL for Cesium runtime assets (Workers, Assets, etc.) - defaults to "/cesium"

  // Core Cesium configuration - pass through to Cesium constructors
  options?: CesiumWidget.ConstructorOptions;
  screenSpaceCameraController?: CesiumScreenSpaceCameraController.ConstructorOptions;

  // CARMA scene management
  sceneStyle?: SceneStyleConfig; // Single scene style configuration
  // Tileset loading configuration
  minInitialTilesetTileCount?: number; // Minimum number of tiles to load before considering tileset ready (default: 10)

  // TODO: Migrate to plugin system
  /* MARKERS
  markerKey?: string;
  markerAnchorHeight?: number;
  markers?: CesiumMarkerOptions[];
  models?: ModelConfig[];
  modelAssets?: Record<string, MarkerModelAsset | ParsedMarkerModelAsset>;
  */
};
