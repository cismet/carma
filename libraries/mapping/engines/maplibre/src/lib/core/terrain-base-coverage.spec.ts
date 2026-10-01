import { describe, expect, it } from "vitest";
import { planTerrainBaseStages } from "./terrain-base-coverage";
import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";

describe("terrain input-raster baseline stages", () => {
  it("adds complete XYZ levels in order up to 4k/8k without interpreting pixels as mesh error", () => {
    const coarse = planTerrainBaseStages(
      NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
      4096
    );
    const fine = planTerrainBaseStages(
      NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
      8192
    );
    expect(fine.slice(0, coarse.length)).toEqual(coarse);
    expect(fine.at(-1)!.level).toBe(coarse.at(-1)!.level + 1);
    expect(fine.at(-1)!.rasterEdgePixels).toBeLessThanOrEqual(8192);
    expect(fine.map(({ level }) => level)).toEqual(
      Array.from({ length: fine.length }, (_, i) => i + 5)
    );
  });

  it("bounds global tile enumeration and rejects an unsupported wrapped extent", () => {
    const source = {
      ...NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
      minzoom: 0,
      bounds: [-180, -85, 180, 85] as const,
    };
    expect(
      planTerrainBaseStages(source, 8192).at(-1)!.ids.length
    ).toBeLessThanOrEqual(1024);
    expect(
      planTerrainBaseStages({ ...source, bounds: [170, -5, -170, 5] }, 8192)
    ).toEqual([]);
  });
});
