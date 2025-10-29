import { OpenStreetMapImageryProvider } from "cesium";

export { OpenStreetMapImageryProvider };

/**
 * Primitive constructor options for OpenStreetMapImageryProvider
 */
export type OpenStreetMapImageryProviderConstructorOptionsPrimitive = {
  url?: string;
  fileExtension?: string;
  rectangle?: import("./Rectangle").RectanglePrimitive;
  minimumLevel?: number;
  maximumLevel?: number;
};
