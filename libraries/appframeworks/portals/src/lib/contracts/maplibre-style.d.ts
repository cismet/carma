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

/** Shared ad-hoc pointcloud asset contract for MapLibre and future Cesium renderers. */
export type CarmaConf3DPointCloud = {
  format: "carma-pointcloud-v1";
  /**
   * How the cloud is delivered at `url`. "copc" (the default when absent)
   * points at a COPC LAZ file streamed by range requests; "3d-tiles" points
   * at a 3D Tiles 1.1 tileset.json whose tile content is glTF POINTS.
   */
  delivery?: "copc" | "3d-tiles";
  url: string;
  source: {
    horizontalCrs: string;
    verticalDatum?: string;
    units: "meters";
  };
  transform: {
    /** Column-major, column-vector, source-frame to target-frame matrix. */
    matrix: readonly [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number
    ];
  };
  bounds?: {
    crs: string;
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  };
  fields?: readonly string[];
  hasRgb?: boolean;
};

export type CarmaConf3DClippingPolygon = {
  type: "Polygon";
  coordinates: number[][][];
  inverse?: boolean;
  enabled?: boolean;
};

export type CarmaConf3D = {
  model?: CarmaConf3DModel;
  pointcloud?: CarmaConf3DPointCloud;
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
