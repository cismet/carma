import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { prepareTerrainDrapeStyle } from "./terrain-drape-style";

describe("terrain albedo style preparation", () => {
  it("removes unused baked relief before installation, preserving DEM and imagery", () => {
    const style: StyleSpecification = {
      version: 8,
      sources: {
        dem: { type: "raster-dem", tiles: ["/dem"] },
        relief: { type: "raster", tiles: ["/relief"] },
        imagery: { type: "raster", tiles: ["/imagery"] },
      },
      terrain: { source: "dem" },
      layers: [
        { id: "Schummerung_Comb", type: "raster", source: "relief" },
        { id: "slope", type: "hillshade", source: "dem" },
        { id: "aerial", type: "raster", source: "imagery" },
      ],
    };
    const result = prepareTerrainDrapeStyle(style);
    expect(result.layers.map(({ id }) => id)).toEqual(["aerial"]);
    expect(Object.keys(result.sources)).toEqual(["dem", "imagery"]);
    expect(style.layers).toHaveLength(3);
    expect(style.sources.relief).toBeDefined();
    expect(prepareTerrainDrapeStyle(result)).toEqual(result);
  });
});
