import type { StyleSpecification } from "maplibre-gl";

export type CarmaConf3D = {
  groundPolyline?:
    | boolean
    | {
        lineColor?: string;
        opacity?: number;
        lineWidth?: number;
      };
  wall?: boolean;
};

export type CarmaMapLibreStyleMetadata = {
  carmaConf?: {
    instant?: boolean;
    layerInfo?: {
      title?: string;
      header?: string;
      accentColor?: string;
    };
  };
};

export type CarmaMapLibreStyleData = StyleSpecification & {
  metadata?: CarmaMapLibreStyleMetadata;
};

export type CarmaMapLibreFeatureProperties = {
  carmaConf3D?: CarmaConf3D;
  [key: string]: unknown;
};
