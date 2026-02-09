import type { StyleSpecification } from "maplibre-gl";

export type CarmaConf3DModel = {
  url: string;
  position: {
    lon: number;
    lat: number;
    height?: number;
  };
  heading?: number;
  pitch?: number;
  roll?: number;
  scale?: number;
  showFootprintIn3d?: boolean;
};

export type CarmaConf3D = {
  model?: CarmaConf3DModel;
  groundPolyline?:
    | boolean
    | {
        lineColor?: string;
        opacity?: number;
        lineWidth?: number;
      };
  groundPolygon?:
    | boolean
    | {
        fillColor?: string;
        opacity?: number;
      };
  wall?:
    | boolean
    | {
        height?: number;
        selectionColor?: string;
      };
};

export type CarmaMapLibreStyleMetadata = {
  carmaConf?: {
    instant?: boolean;
    layerInfo?: {
      title?: string;
      header?: string;
      accentColor?: string;
      keywords?: string[];
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
