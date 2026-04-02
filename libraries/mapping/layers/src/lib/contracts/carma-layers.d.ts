import type { ReactNode } from "react";
import type { CarmaConfig } from "./carma-config";

export type LayerFilterInfo = {
  activeCount: number;
  totalCount: number;
  isShowingAll: boolean;
};

export type InteractionButton = {
  icon: ReactNode;
  id: string;
  tooltip?: string;
  onClick?: () => void;
};

export type DynamicStylingOption = {
  id: string;
  title: string;
  icon?: string;
  replacements?: Record<string, [string, string][]>;
  [key: string]: unknown;
};

export type DynamicStylingListConfig = {
  type: "list";
  label: string;
  default: string;
  options: DynamicStylingOption[];
  targets: Record<string, string[]>;
  showIcon?: boolean;
};

export type DynamicStylingVisibilityConfig = {
  type: "visibility";
  label: string;
  default: "visible" | "hidden";
  layers: string[];
  showIcon?: boolean;
  iconVisible?: string;
  iconHidden?: string;
};

export type DynamicStylingConfig =
  | DynamicStylingListConfig
  | DynamicStylingVisibilityConfig;

export type BackgroundLayer = BaseLayer & {
  layers: string;
  layerType:
    | typeof LAYER_PROVIDER_TYPES.WMTS
    | typeof LAYER_PROVIDER_TYPES.WMTS_NT
    | typeof LAYER_PROVIDER_TYPES.VECTOR;
  props?: LayerProps | VectorStyleProps;
  type?: typeof LAYER_ENTITY_TYPES.LAYER | typeof LAYER_ENTITY_TYPES.OBJECT;
  inhalt?: string;
  eignung?: string;
};

export const LAYER_CONFIG_TYPES = {
  TOPICMAPS: "topicmaps",
} as const;
export type LayerConfigType =
  (typeof LAYER_CONFIG_TYPES)[keyof typeof LAYER_CONFIG_TYPES];

export const FILTER_MODES = {
  AND: "and",
  OR: "or",
} as const;
export type FilterMode = (typeof FILTER_MODES)[keyof typeof FILTER_MODES];

export const FILTER_TYPES = {
  BUTTON: "button",
} as const;
export type FilterType = (typeof FILTER_TYPES)[keyof typeof FILTER_TYPES];

export const LAYER_ENTITY_TYPES = {
  LAYER: "layer",
  OBJECT: "object",
  LINK: "link",
  FEATURE: "feature",
  COLLECTION: "collection",
} as const;
export type LayerEntityType =
  (typeof LAYER_ENTITY_TYPES)[keyof typeof LAYER_ENTITY_TYPES];

export const LAYER_PROVIDER_TYPES = {
  WMTS: "wmts",
  WMTS_NT: "wmts-nt",
  VECTOR: "vector",
} as const;
export type LayerProviderType =
  (typeof LAYER_PROVIDER_TYPES)[keyof typeof LAYER_PROVIDER_TYPES];

export type LayerConfig = {
  name: string;
  url?: string;
  type?: LayerConfigType;
};

export type FilterOption = {
  key: string;
  label: string;
  icon?: string;
  inactiveIcon?: string;
  color?: string;
  propertyName: string;
  propertyValue: string;
  grayscaleWhenInactive?: boolean;
};

export type FilterConfig = {
  allLabel?: string;
  layerPattern: string;
  filterMode?: FilterMode;
  filterType?: FilterType;
  filters: FilterOption[];
  styles?: {
    buttonBorderRadius?: string;
    selectedBorderColor?: string;
    iconSize?: string;
    fontSize?: string;
    gap?: string;
    maxWidth?: string;
  };
};

export type LayerProps = {
  url: string;
  name: string;
  style?: string | object;
  maxZoom?: number;
  minZoom?: number;
  legend?: {
    format: string;
    OnlineResource: string;
    size: [number, number];
  }[];
  featureInfoUrl?: string;
  featureInfoName?: string;
  metaData?: {
    Format: string;
    OnlineResource: string;
    type: string;
  }[];
};

type OtherLayerProps = Partial<LayerProps & Item> & {
  layerName?: string;
  capabilitiesUrl?: string;
  header?: string;
  accentColor?: string;
  headerColor?: string;
};

type BaseLayer = {
  title: string;
  id: string;
  opacity?: number;
  description?: string;
  visible: boolean;
  queryable?: boolean;
  useInFeatureInfo?: boolean;
  conf?: CarmaConfig;
  icon?: string;
  pinned?: "first" | "last";
  skipSelection?: boolean;
  interactionButtons?: InteractionButton | InteractionButton[];
  other?: OtherLayerProps;
  filterConfig?: FilterConfig;
  filterInfo?: LayerFilterInfo;
  filterState?: Record<string, boolean>;
  dynamicStyling?: DynamicStylingConfig | DynamicStylingConfig[];
  dynamicStylingSelection?: string | Record<number, string>;
  layerInfo?: {
    accentColor?: string;
    title?: string;
    keywords?: string[];
    description?: string;
    tags?: string[];
    thumbnail?: string;
    vectorStyle?: string;
    vectorLegend?: string;
    metaDataText?: string;
    [key: string]: unknown;
  };
};

export type Layer = BaseLayer & {
  type?: typeof LAYER_ENTITY_TYPES.LAYER | typeof LAYER_ENTITY_TYPES.OBJECT;
  layerType?:
    | typeof LAYER_PROVIDER_TYPES.WMTS
    | typeof LAYER_PROVIDER_TYPES.WMTS_NT
    | typeof LAYER_PROVIDER_TYPES.VECTOR;
  props?: LayerProps | VectorStyleProps;
};

type Link = {
  type: typeof LAYER_ENTITY_TYPES.LINK;
  url: string;
};

type Collection = {
  type: typeof LAYER_ENTITY_TYPES.COLLECTION;
  layers: Array<Layer | BackgroundLayer>;
  backgroundLayer?: BackgroundLayer;
  settings?: {
    lat?: number;
    lng?: number;
    zoom?: number;
    minZoomlevel?: number;
    maxZoomlevel?: number;
  };
};

export type SavedLayerConfig = {
  title: string;
  description: string;
  type: string;
  id: string;
  thumbnail?: string;
  layers?: Array<Layer | BackgroundLayer>;
  serviceName: string;
};

export type LayerPropsWithProvider = {
  layerType:
    | typeof LAYER_PROVIDER_TYPES.WMTS
    | typeof LAYER_PROVIDER_TYPES.WMTS_NT
    | typeof LAYER_PROVIDER_TYPES.VECTOR;
  props: XMLLayer;
};

export type VectorStyleProps = {
  url?: string;
  name?: string;
  style: string | object;
  maxZoom?: number;
  minZoom?: number;
  legend?: {
    format: string;
    OnlineResource: string;
    size: [number, number];
  }[];
  metaData?: {
    Format: string;
    OnlineResource: string;
    type: string;
  }[];
};

export type VectorProps = {
  layerType: typeof LAYER_PROVIDER_TYPES.VECTOR;
  props: VectorStyleProps;
};

export type ObjectProps = {
  type: typeof LAYER_ENTITY_TYPES.OBJECT;
  layerType: typeof LAYER_PROVIDER_TYPES.VECTOR;
  props: VectorStyleProps;
};

type Service = {
  name: string;
  url: string;
};

type TmpLayer = {
  type: typeof LAYER_ENTITY_TYPES.LAYER | typeof LAYER_ENTITY_TYPES.OBJECT;
} & LayerPropsWithProvider;

type Feature = {
  type: typeof LAYER_ENTITY_TYPES.FEATURE;
};

export type Config = {
  Title: string;
  serviceName?: string;
  id?: string;
  layers: Item[];
};

export type Item = {
  title: string;
  description: string;
  tags?: string[];
  thumbnail?: string;
  copyright?: string;
  keywords?: string[];
  icon?: string;
  alternativeIcon?: string;
  service?: Service;
  name?: string;
  queryable?: boolean;
  useInFeatureInfo?: boolean;
  pictureBoundingBox?: [number, number, number, number];
  maxZoom?: number;
  minZoom?: number;
  id: string;
  serviceName: string;
  path?: string;
  originalPath?: string;
  isDraft?: boolean;
  vectorStyle?: string;
  vectorLegend?: string;
  ff?: string;
  replaceId?: string;
  mergeId?: string;
} & (TmpLayer | Link | Feature | Collection);

export interface WMSLatLonBoundingBox {
  0: number;
  1: number;
  2: number;
  3: number;
  length: 4;
}

export interface WMSGeographicBoundingBox {
  westBoundLongitude: number;
  eastBoundLongitude: number;
  southBoundLatitude: number;
  northBoundLatitude: number;
}

export interface WMSDimension {
  name?: string;
  units?: string;
  unitSymbol?: string;
  default?: string;
  multipleValues?: boolean;
  nearestValue?: boolean;
  current?: boolean;
  values: string[];
}

export interface WMSMetadataURL {
  type?: string;
  format: string;
  onlineResource: string;
}

export interface LegacyWMSMetadataURL {
  Format: string;
  OnlineResource: string;
  type: string;
}

export type XMLLayer = {
  Abstract: string;
  Attribution?: string;
  BoundingBox: {
    crs: string;
    extent: number[];
    res: Array<number | undefined>;
  }[];
  KeywordList?: string[];
  Dimension?: WMSDimension | WMSDimension[];
  EX_GeographicBoundingBox?: WMSGeographicBoundingBox;
  LatLonBoundingBox: WMSLatLonBoundingBox | number[];
  MaxScaleDenominator?: number;
  MetadataURL?: LegacyWMSMetadataURL[];
  MinScaleDenominator?: number;
  Name: string;
  SRS: string[];
  ScaleHint: {
    max: number;
    min: number;
  };
  Style: {
    name: string;
    Title: string;
    LegendURL: {
      format: string;
      OnlineResource: string;
      size: [number, number];
    }[];
  }[];
  style?: string;
  Title: string;
  cascaded: number;
  fixedHeight: number;
  fixedWidth: number;
  noSubsets: boolean;
  opaque: boolean;
  queryable: boolean;
  tags: string[];
  url: string;
};

export interface FullScreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

export interface FullScreenHTMLElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}
