import { describe, expect, it } from "vitest";

import type { BackgroundLayer } from "@carma-mapping/layers";

import { geoportalBackgroundToLibreLayers } from "./geoportalBackgroundToLibreLayers";

const background = {
  id: "karte",
  title: "Stadtplan",
  visible: true,
  opacity: 0.8,
  layers: "rvrGrundriss@100|amtlich@90|rvrSchriftNT@100",
} as BackgroundLayer;

describe("Geoportal shaded terrain background composition", () => {
  it("replaces raster-labelled bases with a separable vector basemap", () => {
    const layers = geoportalBackgroundToLibreLayers(
      background,
      {
        amtlich: {
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
      { shadowTerrainActive: true }
    );

    expect(layers).toHaveLength(1);
    expect(
      layers.some(
        (layer) => "layers" in layer && layer.layers === "ground-plan"
      )
    ).toBe(false);
    expect(layers).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "bg-basemap_relief",
        style: "https://example.test/vector-basemap.json",
        opacity: 0.8,
      }),
    ]);
  });

  it("keeps the authored background unchanged without shaded terrain", () => {
    const layers = geoportalBackgroundToLibreLayers(background, {
      amtlich: {
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
