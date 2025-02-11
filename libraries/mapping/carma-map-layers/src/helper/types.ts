import { BackgroundLayer } from "@carma-apps/portals";
import type { CarmaConfig } from "@carma-commons/utils";

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
};

// TODO: fix typing and verify
type OtherLayerProps = Partial<LayerProps & Item & { props: XMLLayer }>;

export type Layer = {
  title: string;
  // url: string;
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
  serviceName: string;
  layers: Item[];
};

export type Item = {
  title: string;
  description: string;
  tags: string[];
  thumbnail?: string;
  keywords?: string[];
  icon?: string;
  alternativeIcon?: string;
  service?: Service;
  name: string;
  queryable?: boolean;
  useInFeatureInfo?: boolean;
  pictureBoundingBox?: [number, number, number, number];
  maxZoom?: number;
  minZoom?: number;
  id: string;
  serviceName: string;
  path?: string;
} & (tmpLayer | Link | Feature | Collection);

export type XMLLayer = {
  Abstract: string;
  Attribution?: string;
  BoundingBox: {
    crs: string;
    extent: number[];
    res: number | undefined[];
  }[];
  KeywordList?: string[];
  Dimension?: any;
  EX_GeographicBoundingBox?: any;
  LatLonBoundingBox: number[];
  MaxScaleDenominator?: any;
  // TODO verify this type
  MetadataURL?: any;
  MinScaleDenominator?: any;
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
