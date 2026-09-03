import { describe, expect, it } from "vitest";

import type { BackgroundLayer } from "@carma-mapping/layers";

import { geoportalBackgroundToLibreLayers } from "./geoportalBackgroundToLibreLayers";

const background = {
  id: "karte",
  title: "Stadtplan",
  visible: true,
  opacity: 0.8,
  layers: "rvrGrundriss@100|opaque-city-map@90|rvrSchriftNT@100",
} as BackgroundLayer;

describe("Geoportal mesh background composition", () => {
  it("keeps the base for terrain draping and adds only transparent labels", () => {
    const layers = geoportalBackgroundToLibreLayers(
      background,
      {
        "opaque-city-map": {
          type: "tiles",
          url: "https://example.test/city-map/{z}/{x}/{y}.png",
        },
        rvrGrundriss: {
          type: "wmts",
          url: "https://example.test/opaque-ground-plan",
          layers: "ground-plan",
        },
        rvrSchriftNT: {
          type: "wmts-nt",
          url: "https://example.test/labels",
          layers: "labels",
          transparent: true,
        },
        basemap_relief: {
          type: "vector",
          style: "https://example.test/vector-basemap.json",
        },
      },
      { terrainMeshActive: true }
    );

    expect(layers).toHaveLength(2);
    expect(
      layers.some(
        (layer) => "layers" in layer && layer.layers === "ground-plan"
      )
    ).toBe(false);
    expect(layers[0]).toEqual(
      expect.objectContaining({
        type: "tiles",
        name: "opaque-city-map",
      })
    );
    expect(layers[0]?.opacity).toBeCloseTo(0.72);
    expect(layers.slice(1)).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "bg-basemap_relief",
        style: "https://example.test/vector-basemap.json",
        opacity: 0.8,
      }),
    ]);
  });

  it("keeps the authored background unchanged without a terrain mesh", () => {
    const layers = geoportalBackgroundToLibreLayers(background, {
      "opaque-city-map": {
        type: "tiles",
        url: "https://example.test/city-map/{z}/{x}/{y}.png",
      },
      rvrGrundriss: {
        type: "wmts",
        url: "https://example.test/opaque-ground-plan",
        layers: "ground-plan",
      },
      rvrSchriftNT: {
        type: "wmts-nt",
        url: "https://example.test/labels",
        layers: "labels",
        transparent: true,
      },
      basemap_relief: {
        type: "vector",
        style: "https://example.test/vector-basemap.json",
      },
    });

    expect(layers).toHaveLength(3);
    expect(
      layers.some(
        (layer) => "layers" in layer && layer.layers === "ground-plan"
      )
    ).toBe(true);
  });
});
