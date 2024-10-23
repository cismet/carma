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
  other?: Item;
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
};

export type SavedLayerConfig = {
  title: string;
  description: string;
  type: string;
  id: string;
  thumbnail?: string;
  layers: Layer[];
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
  service?: { name: string; url: string };
  name: string;
  queryable?: boolean;
  useInFeatureInfo?: boolean;
  pictureBoundingBox?: [number, number, number, number];
  maxZoom?: number;
  minZoom?: number;
  id: string;
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
