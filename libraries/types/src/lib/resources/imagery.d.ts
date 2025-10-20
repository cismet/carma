import type { Metadata } from "./metadata";
import type {
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  TileMapServiceImageryProvider,
  OpenStreetMapImageryProvider,
  SingleTileImageryProvider,
} from "@carma/cesium";

type WMSOptions = WebMapServiceImageryProvider.ConstructorOptions;
type WMTSOptions = WebMapTileServiceImageryProvider.ConstructorOptions;
type TMSOptions = TileMapServiceImageryProvider.ConstructorOptions;
type OSMOptions = OpenStreetMapImageryProvider.ConstructorOptions;
type SingleTileOptions = SingleTileImageryProvider.ConstructorOptions;

/**
 * supported imagery provider types add more if needed
 */
export const ImageryProviderTypes = {
  WMS: "wms",
  WMTS: "wmts",
  TMS: "tms",
  OSM: "osm",
  SINGLE_TILE: "singleTile",
} as const;

export type ImageryProviderType =
  (typeof ImageryProviderTypes)[keyof typeof ImageryProviderTypes];

/**
 * Imagery resource configuration
 * Discriminated union based on provider type
 * TypeScript will automatically narrow the options type based on the type field
 */
export type ImageryResourceConfig =
  | {
      type: "wms";
      providerOptions: WMSOptions;
      metadata?: Metadata;
    }
  | {
      type: "wmts";
      providerOptions: WMTSOptions;
      metadata?: Metadata;
    }
  | {
      type: "tms";
      providerOptions: TMSOptions;
      metadata?: Metadata;
    }
  | {
      type: "osm";
      providerOptions: OSMOptions;
      metadata?: Metadata;
    }
  | {
      type: "singleTile";
      providerOptions: SingleTileOptions;
      metadata?: Metadata;
    };
