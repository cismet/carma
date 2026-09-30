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
  it("keeps the chosen background and only adjusts a vector style for the drape", () => {
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
      },
      { shadowTerrainActive: true }
    );

    // The authored background survives: no substituted basemap, so switching
    // to Luftbild or adding 2D layers keeps working while shadows are on.
    expect(layers).toHaveLength(3);
    expect(
      layers.some(
        (layer) => "layers" in layer && layer.layers === "ground-plan"
      )
    ).toBe(true);
    expect(
      layers.some(
        (layer) => "name" in layer && layer.name === "bg-basemap_relief"
      )
    ).toBe(false);
  });

  it("substitutes the vector base only when the override asks for it", () => {
    const named = {
      amtlich: {
        type: "tiles" as const,
        url: "https://example.test/city-map/{z}/{x}/{y}.png",
      },
      rvrGrundriss: {
        type: "wmts" as const,
        url: "https://example.test/opaque-ground-plan",
        layers: "ground-plan",
      },
      rvrSchriftNT: {
        type: "wmts-nt" as const,
        url: "https://example.test/labels",
        layers: "labels",
        transparent: true,
      },
      basemap_relief: {
        type: "vector" as const,
        style: "https://example.test/vector-basemap.json",
      },
    };
    const overridden = geoportalBackgroundToLibreLayers(background, named, {
      shadowTerrainActive: true,
      vectorBaseOverride: true,
    });
    expect(overridden).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "bg-basemap_relief",
        userStyleTransformKey: "terrain-albedo-v1",
      }),
    ]);
    // Without the override the authored raster bases stay.
    const authored = geoportalBackgroundToLibreLayers(background, named, {
      shadowTerrainActive: true,
    });
    expect(authored).toHaveLength(3);
    expect(
      authored.some(
        (layer) => "name" in layer && layer.name === "bg-basemap_relief"
      )
    ).toBe(false);
  });

  it("adjusts a vector background in place while shaded terrain is active", () => {
    const vectorBackground = {
      ...background,
      layers: "basemap_relief@100",
    } as BackgroundLayer;
    const layers = geoportalBackgroundToLibreLayers(
      vectorBackground,
      {
        basemap_relief: {
          type: "vector",
          style: "https://example.test/vector-basemap.json",
        },
      },
      { shadowTerrainActive: true }
    );

    expect(layers).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "bg-basemap_relief",
        style: "https://example.test/vector-basemap.json",
        userStyleTransform: expect.any(Function),
        userStyleTransformKey: "terrain-albedo-v1",
      }),
    ]);
    // Without shaded terrain the same style is requested untouched, so
    // disabling the simulation restores the original appearance.
    const plain = geoportalBackgroundToLibreLayers(vectorBackground, {
      basemap_relief: {
        type: "vector",
        style: "https://example.test/vector-basemap.json",
      },
    });
    expect(plain[0]).not.toHaveProperty("userStyleTransform");
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
