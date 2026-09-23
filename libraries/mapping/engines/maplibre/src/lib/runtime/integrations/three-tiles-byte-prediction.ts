import {
  TILE_BYTES_PREDICTION,
  planTileBytesObservation,
  predictTileBytes,
  tileBytesLevel,
} from "../../core/tile-bytes-predictor";
import type { TileBytesSample } from "../../core/tile-bytes-predictor";

export interface TileBytesPredictor {
  predict: (tile: TileBytesSample) => number;
  observe: (tile: TileBytesSample, bytes: number) => void;
  globalEstimate: () => number;
}

/** Runtime memo applies the pure prediction and observation decisions. */
export const createTileBytesPredictor = (): TileBytesPredictor => {
  const urlMemo = new Map<string, number>();
  const levelEstimates = new Map<number, number>();
  let globalEstimate: number | undefined;

  const rememberUrl = (url: string, bytes: number) => {
    if (urlMemo.has(url)) urlMemo.delete(url);
    urlMemo.set(url, bytes);
    if (urlMemo.size > TILE_BYTES_PREDICTION.urlMemoLimit) {
      const oldest = urlMemo.keys().next().value;
      if (oldest !== undefined) urlMemo.delete(oldest);
    }
  };

  return {
    predict(tile) {
      return predictTileBytes(tile, {
        rememberedBytes: tile.url === null ? undefined : urlMemo.get(tile.url),
        levelEstimate: levelEstimates.get(tileBytesLevel(tile.geometricError)),
        globalEstimate,
      });
    },
    observe(tile, bytes) {
      const level = tileBytesLevel(tile.geometricError);
      const plan = planTileBytesObservation(tile, bytes, {
        levelEstimate: levelEstimates.get(level),
        globalEstimate,
      });
      if (plan === null) return;
      if (plan.url !== null) rememberUrl(plan.url, bytes);
      levelEstimates.set(plan.level, plan.levelEstimate);
      globalEstimate = plan.globalEstimate;
    },
    globalEstimate: () =>
      Math.round(globalEstimate ?? TILE_BYTES_PREDICTION.initialBytes),
  };
};
