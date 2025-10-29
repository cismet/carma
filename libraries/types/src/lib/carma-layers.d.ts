import { CarmaConfig } from "./carma-config";

export type BackgroundLayer = Layer & {
  layers: string;
  inhalt?: string;
  eignung?: string;
};

export type LayerConfig = {
  name: string;
  url?: string;
  type?: "topicmaps";
};

export type LayerProps = {
  url: string;
  name: string;
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

// TODO: fix typing and verify
type OtherLayerProps = Partial<LayerProps & Item> & {
  layerName?: string;
  capabilitiesUrl?: string;
  header?: string;
  accentColor?: string;
};

export type Layer = {
  title: string;
  id: string;
  opacity: number;
  description: string;
  visible: boolean;
  queryable?: boolean;
  useInFeatureInfo?: boolean;
  conf?: CarmaConfig;
  icon?: string;
  other?: OtherLayerProps;
} & (
  | {
      layerType: "wmts" | "wmts-nt";
      props: LayerProps;
    }
  | vectorProps
);

type Link = {
  type: "link";
  url: string;
};

type Collection = {
  type: "collection";
  layers: Layer[];
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
  layers: Layer[];
  serviceName: string;
};

export type layerProps = {
  layerType: "wmts" | "wmts-nt" | "vector";
  props: XMLLayer;
};

export type vectorProps = {
  layerType: "vector";
  props: {
    style: string;
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
};

type Service = {
  name: string;
  url: string;
};

type tmpLayer = {
  type: "layer";
} & layerProps;

type Feature = {
  type: "feature";
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
  isDraft?: boolean;
  vectorStyle?: string;
  vectorLegend?: string;
} & (tmpLayer | Link | Feature | Collection);

/** Bounding box as defined in WMS Capabilities (LatLonBoundingBox) */
export interface WMSLatLonBoundingBox {
  /** westBoundLongitude, southBoundLatitude, eastBoundLongitude, northBoundLatitude */
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

/**
 * Standardized (lower camel case) WMS metadata URL shape.
 * NOTE: Existing implementation code in the repo expects an array of legacy objects with
 * capitalized keys (Format, OnlineResource, type). To remain backwards compatible we expose
 * a union (see XMLLayer.MetadataURL) that allows both shapes in a single array.
 */
export interface WMSMetadataURL {
  type?: string;
  format: string;
  onlineResource: string;
}

/** Legacy metadata entry shape kept for backward compatibility. */
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
  /**
   * Backward compatible metadata list. Keep legacy shape only for now so existing
   * code (expecting capitalized keys) does not need adjustments.
   * Follow-up issue will introduce normalization to the lower-cased variant.
   * TODO(dxmigrate): Replace with normalized WMSMetadataURL[] after migration.
   */
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
