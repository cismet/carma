import type { Metadata } from "./metadata";
import type { SurfaceModelType } from "./content";
import type { CesiumTerrainProvider } from "cesium";

export const CesiumTerrainFormats = {
  QuantizedMesh: "quantizedMesh",
  Heightmap: "heightmap",
} as const;

export type CesiumTerrainFormat =
  (typeof CesiumTerrainFormats)[keyof typeof CesiumTerrainFormats];

/**
 * Cesium Terrain resource configuration
 */
export type CesiumTerrainResourceConfig = {
  url: string;
  options?: CesiumTerrainProvider.ConstructorOptions;
  metadata?: Metadata & {
    format?: CesiumTerrainFormat;
    surfaceType?: SurfaceModelType;
  };
};
