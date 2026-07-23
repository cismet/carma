export type ElevationDatum = "dhhn" | "ellipsoidal" | "surfaceRelative";

interface TerrainBaseHeightOptions {
  datum: ElevationDatum;
  zBase: number;
  geoidUndulation: number;
  surfaceHeightTerrain?: number;
}

/**
 * Resolves a cloud's local zero into the MapLibre terrain provider's
 * DHHN2016-height frame. GCG2016 supplies h = H_DHHN2016 + zeta.
 */
export const resolveTerrainBaseHeight = ({
  datum,
  zBase,
  geoidUndulation,
  surfaceHeightTerrain,
}: TerrainBaseHeightOptions): number => {
  if (!Number.isFinite(geoidUndulation)) {
    throw new Error("GCG2016 undulation is unavailable");
  }

  if (datum === "ellipsoidal") return zBase - geoidUndulation;
  if (datum === "dhhn") return zBase;
  if (!Number.isFinite(surfaceHeightTerrain)) {
    throw new Error(
      "Surface-relative data requires an active registered terrain surface"
    );
  }
  return surfaceHeightTerrain as number;
};
