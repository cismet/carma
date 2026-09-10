import type { ReactNode } from "react";
import type { DeploymentTarget } from "@carma-commons/utils";
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

type DynamicStylingOptionsConfigBase = {
  label: string;
  default: string;
  options: DynamicStylingOption[];
  targets: Record<string, string[]>;
  showIcon?: boolean;
};

export type DynamicStylingListConfig = DynamicStylingOptionsConfigBase & {
  type: "list";
};

export type DynamicStylingToggleConfig = DynamicStylingOptionsConfigBase & {
  type: "toggle";
};

export type DynamicStylingOptionsConfig =
  | DynamicStylingListConfig
  | DynamicStylingToggleConfig;

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

/**
 * A tool declared on a stack entry, as a bare kind or a kind with its config.
 * Deliberately structural: nothing here reads the kind, entries are only
 * carried through to the addon registry (`@carma-mapping/addons`), which owns
 * the typed kinds and their configs. Typing it against that registry would
 * make the two libraries circular.
 */
export type ToolEntry =
  | string
  | { kind: string; config?: unknown }
  | { addon: string; config?: unknown };

export const LAYER_ENTITY_TYPES = {
  LAYER: "layer",
  OBJECT: "object",
  LINK: "link",
  FEATURE: "feature",
  COLLECTION: "collection",
  WORKFLOW: "workflow",
  GROUP: "group",
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
};

type BaseLayer = {
  title: string;
  id: string;
  opacity?: number;
  /**
   * Animate opacity changes on this layer, in milliseconds or as MapLibre's
   * own `{duration, delay}`. Left out, MapLibre's default applies.
   *
   * For layers whose opacity is driven from outside the app, where a change is
   * a deliberate visual step. Note it also applies when a person changes that
   * same layer's opacity by hand afterwards.
   */
  opacityTransition?: number | { duration: number; delay?: number };
  description?: string;
  visible: boolean;
  queryable?: boolean;
  useInFeatureInfo?: boolean;
  conf?: CarmaConfig;
  icon?: string;
  /** Colour of the row icon; overrides the entry in `iconColorMap`. */
  iconColor?: string;
  /** Size of the row icon as a CSS length, e.g. "1.25rem". Default: 1rem */
  iconSize?: string;
  pinned?: "first" | "last";
  /**
   * A row the app owns rather than the visitor: it gets no button in the layer
   * bar and no removal from any path, only its visibility is theirs. The same
   * contract the background layer has, for a row the app puts on every map,
   * e.g. a default workflow. Groups cannot be permanent.
   */
  permanent?: boolean;
  group?: {
    id: string;
    title: string;
    thumbnail?: string;
    icon?: string;
  };
  skipSelection?: boolean;
  /**
   * Show the info view for this entry even though `skipSelection` keeps it out
   * of the normal layer handling. For an addon row that has something to say
   * about its data, e.g. a time series with a legend; see `entryHasInfoView`.
   */
  hasInfoView?: boolean;
  /** Clicking the row toggles the panel registered under this interaction id. */
  rowClickInteractionId?: string;
  interactionButtons?: InteractionButton | InteractionButton[];
  tools?: ToolEntry[];
  featureBounds?: [number, number, number, number];
  other?: OtherLayerProps;
  filterConfig?: FilterConfig;
  filterInfo?: LayerFilterInfo;
  filterState?: Record<string, boolean>;
  dynamicStyling?: DynamicStylingOptionsConfig | DynamicStylingOptionsConfig[];
  dynamicStylingSelection?: string | Record<number, string>;
  layerInfo?: {
    accentColor?: string;
    header?: string;
    headerColor?: string;
    title?: string;
    keywords?: string[];
    description?: string;
    tags?: string[];
    thumbnail?: string;
    vectorStyle?: string;
    vectorLegend?: string;
    /**
     * Legend images for an entry that has no `props`, i.e. one that is not a
     * map layer of its own. A row with `props` would enter the map render
     * paths (`useCreateCismapLayer`, `geoportalLayersToLibreLayers`), so an
     * addon row carries its legend here instead.
     */
    legend?: { OnlineResource: string }[];
    metaDataText?: string;
    vectorLegendTitle?: string;
    vectorTitle?: string;
    vectorDescription?: string;
    source?: string;
    mapMode?: "2d" | "3d";
    links?: { url: string; text: string }[];
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

export type LayerGroupInfo = {
  legend?: string[];
  metaDataText?: string;
  links?: { url: string; text: string }[];
};

export type LayerGroup = {
  type: typeof LAYER_ENTITY_TYPES.GROUP;
  id: string;
  title: string;
  description?: string;
  icon?: string;
  thumbnail?: string;
  visible: boolean;
  opacity?: number;
  groupInfo?: LayerGroupInfo;
  tools?: ToolEntry[];
  layers: Layer[];
};

export type LayerStackEntry = Layer | LayerGroup;

type Link = {
  type: typeof LAYER_ENTITY_TYPES.LINK;
  url: string;
};

type Collection = {
  type: typeof LAYER_ENTITY_TYPES.COLLECTION;
  layers: Array<LayerStackEntry | BackgroundLayer>;
  backgroundLayer?: BackgroundLayer;
  settings?: {
    lat?: number;
    lng?: number;
    zoom?: number;
    minZoomlevel?: number;
    maxZoomlevel?: number;
  };
};

// A workflow catalog entry: a thematic "Perspektive" step shown as an inert
// card (title/description/thumbnail). It carries no own action yet, so it
// only extends the shared base Item fields.
type Workflow = {
  type: typeof LAYER_ENTITY_TYPES.WORKFLOW;
};

export type SavedLayerConfig = {
  title: string;
  description: string;
  type: string;
  id: string;
  thumbnail?: string;
  layers?: Array<LayerStackEntry | BackgroundLayer>;
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

export type ExtendedItem = Item & { replaceId?: string; mergeId?: string };

/** the map's current layer stack: background layer first, overlays after it */
export type ActiveLayers = [BackgroundLayer, ...Layer[]];

/** host callback that applies, removes or updates a catalog item on the map */
export type SetAdditionalLayers = (
  layer: Item,
  deleteItem?: boolean,
  forceWMS?: boolean,
  previewLayer?: boolean,
  updateExisting?: boolean
) => void | Promise<void>;

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
  vectorLegendTitle?: string;
  vectorTitle?: string;
  vectorDescription?: string;
  ff?: string;
  restrict?: DeploymentTarget | DeploymentTarget[];
  replaceId?: string;
  mergeId?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  mapMode?: "2d" | "3d";
  workflowLayers?: string[];
  workflowLayerItems?: Item[];
  groupInfo?: LayerGroupInfo;
  links?: { url: string; text: string }[];
  tools?: ToolEntry[];
} & (TmpLayer | Link | Feature | Collection | Workflow);

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
