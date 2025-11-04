import type { Metadata } from "@carma/types";
import type {
  TileMapServiceImageryProviderConstructorOptionsPrimitive,
  OpenStreetMapImageryProviderConstructorOptionsPrimitive,
  SingleTileImageryProviderConstructorOptionsPrimitive,
} from "@carma/cesium";

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
      providerOptions: WebMapServiceProviderConstructorOptionsPrimitive;
      metadata?: Metadata;
    }
  | {
      type: "wmts";
      providerOptions: WebMapTileServiceProviderConstructorOptionsPrimitive;
      metadata?: Metadata;
    }
  | {
      type: "tms";
      providerOptions: TileMapServiceImageryProviderConstructorOptionsPrimitive;
      metadata?: Metadata;
    }
  | {
      type: "osm";
      providerOptions: OpenStreetMapImageryProviderConstructorOptionsPrimitive;
      metadata?: Metadata;
    }
  | {
      type: "singleTile";
      providerOptions: SingleTileImageryProviderConstructorOptionsPrimitive;
      metadata?: Metadata;
    };

/**
 * Full imagery provider configuration
 * Abstracts away the specific Cesium provider type
 */

/**
 * Imagery provider configuration with ID
 * Used in sources to declare available imagery providers
 */
export type ImageryProviderConfig = ImageryResourceConfig & {
  id: string;
};

/**
 * Imagery layer reference in a scene style
 * References an imagery provider by its ID and specifies display options
 */
export type ImageryLayerConfig = {
  /** ID of the imagery provider from sources (references ImageryProviderConfig.id) */
  id: string;
  /** Opacity of the imagery layer (0-1) */
  opacity?: number;
};
