// import type { MutableRefObject } from "react"; // Removed - no longer storing refs in Redux
// import type { Map as MaplibreMap } from "maplibre-gl"; // Removed - no longer storing refs in Redux
import type { Layer } from "@carma/types";
import type { SelectedLayerIndex } from "../constants";
import type { SelectionItem } from "../components/SelectionProvider";
import type { SavedLayerConfig } from "./collections";

/**
 * Mapping state and UI configuration types
 */

export type Settings = {
  showLayerButtons: boolean;
  showFullscreen: boolean;
  showLocator: boolean;
  showMeasurement: boolean;
  add3dMode?: boolean;
};

export interface LayerState {
  layers: Layer[];
  selectedLayerIndex: SelectedLayerIndex | number;
  selectedMapLayer: BackgroundLayer;
  selectedLuftbildLayer: BackgroundLayer;
  backgroundLayer: BackgroundLayer;
}

export interface MappingState extends LayerState {
  savedLayerConfigs: SavedLayerConfig[];
  paleOpacityValue: number;
  showLeftScrollButton: boolean;
  showRightScrollButton: boolean;
  showFullscreenButton: boolean;
  showLocatorButton: boolean;
  showMeasurementButton: boolean;
  showHamburgerMenu: boolean;
  focusMode: boolean;
  startDrawing: boolean;
  clickFromInfoView: boolean;
  // libreMapRef removed - refs should not be in Redux (causes "excessively deep type" errors)
  configSelection?: SelectionItem;
  layersIdle: boolean;
}

// Note: BackgroundLayer and SavedLayerConfig are imported from collections.ts
