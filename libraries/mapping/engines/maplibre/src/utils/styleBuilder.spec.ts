// @vitest-environment jsdom

import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { vectorStylesToMapLibreStyle } from "./styleBuilder";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("vectorStylesToMapLibreStyle 3D terrain metadata", () => {
  it("marks a Mesh-tagged 3D tiles layer as the terrain provider", async () => {
    const meshStyle = {
      version: 8,
      metadata: {
        carmaConf: {
          layerInfo: { tags: ["Basis", "3D", "Mesh"] },
        },
      },
      sources: {},
      layers: [
        {
          id: "mesh-carrier",
          type: "background",
          metadata: {
            carmaConf: {
              "3d": {
                renderMode: "tiles3d",
                tilesetUrl: "https://example.test/mesh/tileset.json",
                terrainMandatory: true,
              },
            },
          },
          paint: { "background-opacity": 0 },
        },
      ],
    } as StyleSpecification;

    const { style } = await vectorStylesToMapLibreStyle({
      layers: [{ type: "vector", name: "mesh2024", style: meshStyle }],
      backgroundStyle: { version: 8, sources: {}, layers: [] },
    });

    expect(style.layers?.[0]?.metadata?.carmaConf?.["3d"]).toEqual(
      expect.objectContaining({
        renderMode: "tiles3d",
        providesTerrain: true,
      })
    );
  });

  it("does not mark a LoD2 building layer as terrain", async () => {
    const lod2Style = {
      version: 8,
      metadata: {
        carmaConf: {
          layerInfo: { tags: ["Basis", "Gebäude", "LoD2"] },
        },
      },
      sources: {},
      layers: [
        {
          id: "lod2-carrier",
          type: "background",
          metadata: {
            carmaConf: {
              "3d": {
                renderMode: "tiles3d",
                tilesetUrl: "https://example.test/lod2/tileset.json",
                terrainMandatory: true,
              },
            },
          },
          paint: { "background-opacity": 0 },
        },
      ],
    } as StyleSpecification;

    const { style } = await vectorStylesToMapLibreStyle({
      layers: [{ type: "vector", name: "lod2", style: lod2Style }],
      backgroundStyle: { version: 8, sources: {}, layers: [] },
    });

    expect(
      style.layers?.[0]?.metadata?.carmaConf?.["3d"]?.providesTerrain
    ).toBeUndefined();
  });
});

describe("vectorStylesToMapLibreStyle layer opacity", () => {
  it("fades a circle's stroke along with its fill", async () => {
    const circleStyle = {
      version: 8,
      sources: {
        points: {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        },
      },
      layers: [
        {
          id: "wendehammer",
          type: "circle",
          source: "points",
          paint: {
            "circle-color": "#ffffff",
            "circle-stroke-color": "#a1a1a1",
            "circle-stroke-width": 1,
          },
        },
      ],
    } as StyleSpecification;

    const { style } = await vectorStylesToMapLibreStyle({
      layers: [
        { type: "vector", name: "stadtplan", style: circleStyle, opacity: 0.2 },
      ],
      backgroundStyle: { version: 8, sources: {}, layers: [] },
    });

    const paint = style.layers?.[0]?.paint as Record<string, unknown>;
    expect(paint["circle-opacity"]).toBeCloseTo(0.2);
    expect(paint["circle-stroke-opacity"]).toBeCloseTo(0.2);
  });
});
