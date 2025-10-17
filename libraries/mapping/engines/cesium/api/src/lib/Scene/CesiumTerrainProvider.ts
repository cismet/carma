// Re-export CesiumTerrainProvider class from Cesium
import { CesiumTerrainProvider } from "cesium";
export { CesiumTerrainProvider };

export const isValidCesiumTerrainProvider = (
  provider: unknown
): provider is CesiumTerrainProvider => {
  return provider instanceof CesiumTerrainProvider;
};
