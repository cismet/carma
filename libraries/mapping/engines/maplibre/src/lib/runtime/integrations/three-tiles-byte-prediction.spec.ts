import { describe, expect, it } from "vitest";

import { TILE_BYTES_PREDICTION } from "../../core/tile-bytes-predictor";

import { createTileBytesPredictor } from "./three-tiles-byte-prediction";

const MIB = 1024 ** 2;

describe("createTileBytesPredictor", () => {
  it("learns per URL, level and globally while bounding the URL memo", () => {
    const predictor = createTileBytesPredictor();
    const first = { url: "https://tiles.test/0.b3dm", geometricError: 1 };
    expect(predictor.predict(first)).toBe(TILE_BYTES_PREDICTION.initialBytes);
    predictor.observe(first, 1 * MIB);
    expect(predictor.predict(first)).toBe(1 * MIB);
    expect(predictor.predict({ url: null, geometricError: 1 })).toBe(1 * MIB);
    expect(predictor.predict({ url: null, geometricError: 8 })).toBe(
      Math.round(1 * MIB * TILE_BYTES_PREDICTION.globalMultiplier)
    );
    predictor.observe(first, 0);
    expect(predictor.globalEstimate()).toBe(1 * MIB);
    for (let index = 1; index <= TILE_BYTES_PREDICTION.urlMemoLimit; index += 1)
      predictor.observe(
        { url: `https://tiles.test/${index}.b3dm`, geometricError: 1 },
        2 * MIB
      );
    expect(predictor.predict(first)).not.toBe(1 * MIB);
    expect(predictor.predict(first)).toBeGreaterThan(1.9 * MIB);
  });
});
