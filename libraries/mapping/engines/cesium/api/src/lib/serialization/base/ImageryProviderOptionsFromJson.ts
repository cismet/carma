import {
  OpenStreetMapImageryProvider,
  SingleTileImageryProvider,
  TileMapServiceImageryProvider,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
} from "../../cesium";
import type { BBox } from "@carma/geo/types";
import { rectangleFromBBox } from "./RectangleSerialization";

export type UnsupportedProviderOptions =
  | "clock"
  | "times"
  | "ellipsoid"
  | "tilingScheme"
  | "rectangle";

export type OpenStreetMapImageryProviderConstructorOptionsJson = Omit<
  OpenStreetMapImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: BBox;
};

export const openStreetMapImageryProviderConstructorOptionsFromJson = (
  options: OpenStreetMapImageryProviderConstructorOptionsJson
): OpenStreetMapImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: OpenStreetMapImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};

export type SingleTileImageryProviderConstructorOptionsJson = Omit<
  SingleTileImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: BBox;
};

export const singleTileImageryProviderConstructorOptionsFromJson = (
  options: SingleTileImageryProviderConstructorOptionsJson
): SingleTileImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: SingleTileImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};

export type TileMapServiceImageryProviderConstructorOptionsJson = Omit<
  TileMapServiceImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: BBox;
};

export const tileMapServiceImageryProviderConstructorOptionsFromJson = (
  options: TileMapServiceImageryProviderConstructorOptionsJson
): TileMapServiceImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: TileMapServiceImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};

export type WebMapServiceImageryProviderConstructorOptionsJson = Omit<
  WebMapServiceImageryProvider.ConstructorOptions,
  UnsupportedProviderOptions
> & {
  rectangle?: BBox;
};

export const webMapServiceImageryProviderConstructorOptionsFromJson = (
  options: WebMapServiceImageryProviderConstructorOptionsJson
): WebMapServiceImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: WebMapServiceImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};

export type WebMapTileServiceProviderConstructorOptionsJson = Omit<
  WebMapTileServiceImageryProvider.ConstructorOptions,
  UnsupportedProviderOptions
> & {
  rectangle?: BBox;
};

export const webMapTileServiceProviderConstructorOptionsFromJson = (
  options: WebMapTileServiceProviderConstructorOptionsJson
): WebMapTileServiceImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: WebMapTileServiceImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};
