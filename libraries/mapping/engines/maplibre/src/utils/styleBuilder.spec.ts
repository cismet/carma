// @vitest-environment jsdom

import type { StyleSpecification } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STYLE_RESOURCE_TIMEOUT_MS } from "./fetch-style-resource";
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

describe("vectorStylesToMapLibreStyle remote style deadline", () => {
  const backgroundStyle: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background" }],
  };
  const remoteStyle: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: "remote", type: "background" }],
  };
  const layers = [
    {
      type: "vector" as const,
      name: "stalled",
      carmaLayerId: "stalled-layer",
      style: "https://styles.example.test/stalled.json",
    },
    {
      type: "vector" as const,
      name: "ready",
      carmaLayerId: "ready-layer",
      style: "https://styles.example.test/ready.json",
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["connection", "body"])(
    "skips a stalled %s, retains other layers, and permits retry",
    async (stage) => {
      const stalled = new Promise<never>(() => undefined);
      const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
        if (url === layers[0].style) {
          if (stage === "connection") return stalled;
          return { ok: true, json: () => stalled };
        }
        return { ok: true, json: async () => remoteStyle };
      });
      vi.stubGlobal("fetch", fetchMock);
      let settled = false;
      const pending = vectorStylesToMapLibreStyle({
        layers,
        backgroundStyle,
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(STYLE_RESOURCE_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result.failedLayerIds).toEqual(["stalled-layer"]);
      expect(result.style.layers).toHaveLength(2);
      expect(result.style.layers[0].id).toBe("background");
      expect(result.style.layers[1].metadata?.["carma-layer-id"]).toBe("ready-layer");
      expect(vi.getTimerCount()).toBe(0);
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      expect(options.signal?.aborted).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining("timed out"),
          }),
        })
      );

      fetchMock.mockImplementation(async () => ({
        ok: true,
        json: async () => remoteStyle,
      }));
      const retried = await vectorStylesToMapLibreStyle({
        layers,
        backgroundStyle,
      });
      expect(retried.failedLayerIds).toEqual([]);
      expect(retried.style.layers).toHaveLength(3);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("clears the deadline when a style arrives without aborting it later", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => remoteStyle,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await vectorStylesToMapLibreStyle({
      layers,
      backgroundStyle,
    });
    expect(result.failedLayerIds).toEqual([]);
    expect(result.style.layers).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(STYLE_RESOURCE_TIMEOUT_MS);
    for (const [, options] of fetchMock.mock.calls) {
      expect((options as RequestInit).signal?.aborted).toBe(false);
    }
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
      signal: expect.any(AbortSignal),
    });
  });

  it("keeps the default cache mode without cache=forced", async () => {
    const fetchMock = await fetchWithHash("#/outlet?ff=ng");
    expect(fetchMock).toHaveBeenCalledWith(capabilitiesUrl, {
      signal: expect.any(AbortSignal),
    });
  });
});
