import { CesiumTerrainProvider } from "cesium";
import type { CesiumTerrainResourceConfig } from "@carma/types";

export type CesiumTerrainProviderConfig = CesiumTerrainResourceConfig & {
  id: string;
  constructorOptions?: CesiumTerrainProvider.ConstructorOptions;
};
