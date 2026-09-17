export type ElevationDatum = "dhhn" | "ellipsoidal" | "surfaceRelative";

interface TerrainBaseHeightOptions {
  datum: ElevationDatum;
  zBase: number;
  heightAnomaly: number;
  surfaceHeightTerrain?: number;
}

/**
 * Resolves a cloud's local zero into the MapLibre terrain provider's
 * DHHN2016-height frame. GCG2016 supplies h = H_DHHN2016 + zeta.
 */
export const resolveTerrainBaseHeight = ({
  datum,
  zBase,
  heightAnomaly,
  surfaceHeightTerrain,
}: TerrainBaseHeightOptions): number => {
  if (!Number.isFinite(heightAnomaly)) {
    throw new Error("GCG2016 height anomaly is unavailable");
  }

  if (datum === "ellipsoidal") return zBase - heightAnomaly;
  if (datum === "dhhn") return zBase;
  if (!Number.isFinite(surfaceHeightTerrain)) {
    throw new Error(
      "Surface-relative data requires an active registered terrain surface"
    );
  }
  return surfaceHeightTerrain as number;
};
