// @vitest-environment jsdom

import type { StyleSpecification } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("getVectorMapping WMS capabilities fetch", () => {
  const capabilitiesUrl =
    "https://wms.example.org/?SERVICE=WMS&REQUEST=GetCapabilities";
  const vectorStyles = [
    {
      name: "a",
      style: { version: 8, sources: {}, layers: [] } as StyleSpecification,
      layer: `lyr@${capabilitiesUrl}`,
    },
  ];

  // the cache=forced answer is kept per module instance, so every case loads
  // a fresh one
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  const fetchWithHash = async (hash: string) => {
    window.location.hash = hash;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "<WMS_Capabilities/>",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { getVectorMapping } = await import("./styleBuilder");
    await getVectorMapping(vectorStyles);
    return fetchMock;
  };

  it("asks the http cache with cache=forced", async () => {
    const fetchMock = await fetchWithHash("#/outlet?cache=forced");
    expect(fetchMock).toHaveBeenCalledWith(capabilitiesUrl, {
      cache: "force-cache",
    });
  });

  it("gives no fetch option without cache=forced", async () => {
    const fetchMock = await fetchWithHash("#/outlet?ff=ng");
    expect(fetchMock).toHaveBeenCalledWith(capabilitiesUrl, {});
  });
});
