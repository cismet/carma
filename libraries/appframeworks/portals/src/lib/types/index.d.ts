import type { Layer } from "@carma-mapping/layers";
import type { CismapLayerProps } from "types/react-cismap.extended";

export type VectorObject = Record<string, string>;

export type GeoportalCollection = {
  title: string;
  description: string;
  type: "collection";
  layers: Layer[];
  thumbnail: any;
  id: string;
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
  version?: string;
}

interface WMTSOptions {
  type: "wmts" | "wmts-nt";
  url: string;
  layers: string;
  version?: string;
  tiled?: boolean;
  transparent: boolean;
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
  showLayerHideButtons: boolean;
  showFullscreen: boolean;
  showLocator: boolean;
  showMeasurement: boolean;
  showHamburgerMenu?: boolean;
};

// Store Mapping Slice

export type BackgroundLayer = Layer & {
  layers: string;
  inhalt?: string;
  eignung?: string;
};
export interface LayerState {
  layers: Layer[];
  selectedLayerIndex: number;
  selectedMapLayer: BackgroundLayer;
  backgroundLayer: BackgroundLayer;
}

export interface MappingState extends LayerState {
  savedLayerConfigs: SavedLayerConfig[];
  showLeftScrollButton: boolean;
  showRightScrollButton: boolean;
  showFullscreenButton: boolean;
  showLocatorButton: boolean;
  showMeasurementButton: boolean;
  showHamburgerMenu: boolean;
  focusMode: boolean;
  startDrawing: boolean;
}

export interface FeatureInfoState {
  features: any[];
  selectedFeature: any;
  secondaryInfoBoxElements: any[];
}
