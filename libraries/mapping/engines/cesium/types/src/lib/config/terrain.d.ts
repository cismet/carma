import { CesiumTerrainProvider } from "@carma/cesium";
import type { CesiumTerrainResourceConfig } from "../types";

export type CesiumTerrainProviderConfig = CesiumTerrainResourceConfig & {
  id: string;
  constructorOptions?: CesiumTerrainProvider.ConstructorOptions;
};
