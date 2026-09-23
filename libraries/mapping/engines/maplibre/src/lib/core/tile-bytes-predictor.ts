const MIB = 1024 ** 2;

export const TILE_BYTES_PREDICTION = {
  externalTilesetBytes: 16 * 1024,
  initialBytes: 4 * MIB,
  globalMultiplier: 1.25,
  emaWeight: 0.2,
  urlMemoLimit: 20_000,
} as const;

export type TileBytesSample = Readonly<{
  url: string | null;
  geometricError: number;
  isExternalTileset?: boolean;
}>;

export type TileBytesPredictionFacts = Readonly<{
  rememberedBytes?: number;
  levelEstimate?: number;
  globalEstimate?: number;
}>;

export type TileBytesObservationPlan = Readonly<{
  url: string | null;
  level: number;
  levelEstimate: number;
  globalEstimate: number;
}>;

export const tileBytesLevel = (geometricError: number): number => {
  const level = Math.log2(Math.max(geometricError, Number.EPSILON));
  return Number.isFinite(level) ? Math.round(level) : Number.MIN_SAFE_INTEGER;
};

const blend = (previous: number | undefined, sample: number): number =>
  previous === undefined
    ? sample
    : previous + (sample - previous) * TILE_BYTES_PREDICTION.emaWeight;

export const predictTileBytes = (
  tile: TileBytesSample,
  facts: TileBytesPredictionFacts
): number => {
  if (tile.isExternalTileset) return TILE_BYTES_PREDICTION.externalTilesetBytes;
  if (facts.rememberedBytes !== undefined) return facts.rememberedBytes;
  if (facts.levelEstimate !== undefined) return Math.round(facts.levelEstimate);
  if (facts.globalEstimate !== undefined)
    return Math.round(
      facts.globalEstimate * TILE_BYTES_PREDICTION.globalMultiplier
    );
  return TILE_BYTES_PREDICTION.initialBytes;
};

export const planTileBytesObservation = (
  tile: TileBytesSample,
  bytes: number,
  facts: Pick<TileBytesPredictionFacts, "levelEstimate" | "globalEstimate">
): TileBytesObservationPlan | null => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return {
    url: tile.url,
    level: tileBytesLevel(tile.geometricError),
    levelEstimate: blend(facts.levelEstimate, bytes),
    globalEstimate: blend(facts.globalEstimate, bytes),
  };
};
