import type { CismapLayerProps, Layer } from "@carma/types";
import { SELECTED_LAYER_INDEX, SelectionItem } from "../..";

// TODO elevate some of the type here to carma-commons

export type GeoportalCollection = {
  title: string;
  description: string;
  type: "collection";
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  thumbnail: any;
  id: string;
  serviceName: string;
};

export type LayerInfo = {
  title: string;
  layers: string;
  description: string;
  inhalt: string;
  eignung: string;
  url: string;
};

export type LayerMap = {
  [key: string]: LayerInfo;
};

// NamedStyles

type CSSFilter = string;

interface StyleProperties {
  opacity: number;
  "css-filter"?: CSSFilter;
}

export type NamedStyles = {
  [key: string]: StyleProperties;
};

interface VectorLayerOptions {
  type: "vector";
  style: any;
}

interface WMSOptions {
  type: "wms" | "wms-nt";
  url: string;
  layers: string;
  tiled?: boolean;
  transparent?: boolean;
  maxNativeZoom?: number;
  version?: string;
}

interface WMTSOptions {
  type: "wmts" | "wmts-nt";
  url: string;
  layers: string;
  version?: string;
  tiled?: boolean;
  transparent: boolean;
  maxNativeZoom?: number;
  buffer?: number;
}

interface TilesOptions {
  type: "tiles";
  url: string;
  maxNativeZoom?: number;
  maxZoom?: number;
}

export type NamedLayers = {
  [key: string]: TilesOptions | VectorLayerOptions | WMSOptions | WMTSOptions;
};

interface CismetDefaults {
  wms: Omit<CismapLayerProps, "type">;
  vector: {};
}

export interface LayerConfig {
  namedStyles?: NamedStyles;
  defaults?: CismetDefaults;
  namedLayers: NamedLayers;
}

export interface DefaultLayerConfig {
  namedStyles: NamedStyles;
  defaults: CismetDefaults;
  namedLayers?: NamedLayers;
}

export type Settings = {
  showLayerButtons: boolean;
  showFullscreen: boolean;
  showLocator: boolean;
  showMeasurement: boolean;
  add3dMode?: boolean;
};

// Store Mapping Slice

export interface LayerState {
  layers: Layer[];
  selectedLayerIndex: SELECTED_LAYER_INDEX | number;
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
  libreMapRef: any;
  configSelection?: SelectionItem;
  layersIdle: boolean;
}

export interface FeatureInfoState {
  features: any[];
  selectedFeature: any;
  secondaryInfoBoxElements: any[];
  infoText: string;
  preferredLayerId: string;
  preferredVectorLayerId?: number;
  vectorInfo: any;
  vectorInfos: FeatureInfo[];
  nothingFoundIDs: string[];
  loading: boolean;
  completedVectorLayers: string[];
}
