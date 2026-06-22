import type { StyleSpecification } from "maplibre-gl";

import type { AdhocLayerMapMode, AdhocLayerSource } from "../constants/adhoc";

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

export type CarmaConf3DClippingPolygon = {
  type: "Polygon";
  coordinates: number[][][];
  inverse?: boolean;
  enabled?: boolean;
};

export type CarmaConf3D = {
  model?: CarmaConf3DModel;
  clippingPolygon?: CarmaConf3DClippingPolygon;
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
    annotationsGeoJson?: unknown;
    layerInfo?: {
      title?: string;
      header?: string;
      accentColor?: string;
      keywords?: string[];
      source?: AdhocLayerSource;
      mapMode?: AdhocLayerMapMode;
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
