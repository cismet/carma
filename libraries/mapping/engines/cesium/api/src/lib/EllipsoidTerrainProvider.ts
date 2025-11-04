import { EllipsoidTerrainProvider } from "cesium";

export { EllipsoidTerrainProvider };

export const isValidEllipsoidTerrainProvider = (
  provider: unknown
): provider is EllipsoidTerrainProvider => {
  return provider instanceof EllipsoidTerrainProvider;
};
