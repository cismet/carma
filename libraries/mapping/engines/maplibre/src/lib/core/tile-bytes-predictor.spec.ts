import { describe, expect, it } from "vitest";

import {
  TILE_BYTES_PREDICTION,
  planTileBytesObservation,
  predictTileBytes,
  tileBytesLevel,
} from "./tile-bytes-predictor";

const MIB = 1024 ** 2;

const leaf = { url: "https://tiles.test/a.b3dm", geometricError: 0.5 };

describe("tile byte decisions", () => {
  it("predicts from URL, level, then global evidence", () => {
    expect(predictTileBytes(leaf, {})).toBe(TILE_BYTES_PREDICTION.initialBytes);
    expect(
      predictTileBytes(leaf, {
        rememberedBytes: 3 * MIB,
        levelEstimate: 5 * MIB,
      })
    ).toBe(3 * MIB);
    expect(predictTileBytes(leaf, { levelEstimate: 3.5 * MIB })).toBe(
      Math.round(3.5 * MIB)
    );
    expect(predictTileBytes(leaf, { globalEstimate: 3 * MIB })).toBe(
      Math.round(3 * MIB * TILE_BYTES_PREDICTION.globalMultiplier)
    );
    expect(
      predictTileBytes(
        { ...leaf, isExternalTileset: true },
        { rememberedBytes: 3 * MIB }
      )
    ).toBe(TILE_BYTES_PREDICTION.externalTilesetBytes);
  });

  it("plans the level and global EMA while ignoring invalid samples", () => {
    const first = planTileBytesObservation(leaf, 3 * MIB, {});
    expect(first).toEqual({
      url: leaf.url,
      level: -1,
      levelEstimate: 3 * MIB,
      globalEstimate: 3 * MIB,
    });
    expect(tileBytesLevel(0.6)).toBe(first?.level);
    expect(
      planTileBytesObservation({ url: null, geometricError: 8 }, 5 * MIB, {
        levelEstimate: 2 * MIB,
        globalEstimate: first?.globalEstimate,
      })
    ).toEqual({
      url: null,
      level: 3,
      levelEstimate:
        2 * MIB + (5 * MIB - 2 * MIB) * TILE_BYTES_PREDICTION.emaWeight,
      globalEstimate:
        3 * MIB + (5 * MIB - 3 * MIB) * TILE_BYTES_PREDICTION.emaWeight,
    });
    expect(planTileBytesObservation(leaf, 0, {})).toBeNull();
    expect(planTileBytesObservation(leaf, Number.NaN, {})).toBeNull();
  });
});
