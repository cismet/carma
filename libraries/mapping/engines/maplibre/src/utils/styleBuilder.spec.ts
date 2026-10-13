// @vitest-environment jsdom

import type { StyleSpecification } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STYLE_RESOURCE_TIMEOUT_MS } from "./fetch-style-resource";
import { vectorStylesToMapLibreStyle } from "./styleBuilder";
import { StyleComposer } from "./styleComposer";

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
      expect(result.style.layers[1].metadata?.["carma-layer-id"]).toBe(
        "ready-layer"
      );
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

describe("authored transparent paint survives style merging", () => {
  it("keeps a transparent LoD2 metadata carrier over an existing raster background", async () => {
    const tilesetUrl = "https://example.test/lod2/tileset.json";
    const carrier = {
      version: 8,
      metadata: {
        carmaConf: { layerInfo: { tags: ["Basis", "Gebäude", "LoD2"] } },
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
                tilesetUrl,
                providesTerrain: false,
              },
            },
          },
          paint: { "background-color": "#000000", "background-opacity": 0 },
        },
      ],
    } as StyleSpecification;
    const background = {
      version: 8,
      sources: {
        amtlich: {
          type: "raster",
          tiles: ["https://example.test/raster/{z}/{x}/{y}.png"],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#ffffff" },
        },
        {
          id: "amtlich",
          type: "raster",
          source: "amtlich",
          paint: { "raster-opacity": 0.9 },
        },
      ],
    } as StyleSpecification;
    const { style } = await vectorStylesToMapLibreStyle({
      layers: [{ type: "vector", name: "lod2", style: carrier, opacity: 0.7 }],
      backgroundStyle: background,
    });
    const index = style.layers.findIndex(
      (layer) => layer.metadata?.carmaConf?.["3d"]?.tilesetUrl === tilesetUrl
    );
    expect(index).toBeGreaterThan(
      style.layers.findIndex((layer) => layer.id === "amtlich")
    );
    expect(style.layers[index].paint).toMatchObject({
      "background-color": "#000000",
      "background-opacity": 0,
    });
    expect(style.layers[index].metadata?.carmaConf?.["3d"]).toMatchObject({
      renderMode: "tiles3d",
      tilesetUrl,
      providesTerrain: false,
    });
    expect(
      style.layers.find((layer) => layer.id === "amtlich")?.paint
    ).toMatchObject({ "raster-opacity": 0.9 });
  });
  it.each([
    ["fill", "fill-opacity"],
    ["line", "line-opacity"],
    ["raster", "raster-opacity"],
    ["circle", "circle-opacity"],
    ["circle", "circle-stroke-opacity"],
    ["symbol", "text-opacity"],
    ["symbol", "icon-opacity"],
  ])(
    "preserves explicit zero %s/%s while applying a layer fade",
    async (type, property) => {
      const source =
        type === "raster"
          ? {
              type: "raster",
              tiles: ["https://example.test/{z}/{x}/{y}.png"],
              tileSize: 256,
            }
          : {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            };
      const input = {
        version: 8,
        sources: { sample: source },
        layers: [
          { id: "sample", type, source: "sample", paint: { [property]: 0 } },
        ],
      } as StyleSpecification;
      const { style } = await vectorStylesToMapLibreStyle({
        layers: [
          { type: "vector", name: "sample", style: input, opacity: 0.4 },
        ],
        backgroundStyle: { version: 8, sources: {}, layers: [] },
      });
      expect((style.layers[0].paint as Record<string, unknown>)[property]).toBe(
        0
      );
    }
  );
});

describe("authored raster overlay ownership", () => {
  it("marks explicit raster layers and raster children of added styles without marking base rasters", async () => {
    const raster = (name: string, extra = {}) => ({
      type: "wmts" as const,
      url: "https://example.test/wms",
      layers: name,
      opacity: 0.6,
      ...extra,
    });
    const { style } = await vectorStylesToMapLibreStyle({
      layers: [
        raster("basis"),
        raster("amtliche-farbe", { rasterOverlay: true }),
        raster("einzelbild", { rasterOverlay: true, nonTiled: true }),
        {
          type: "tiles",
          name: "xyz",
          url: "https://example.test/{z}/{x}/{y}.png",
          rasterOverlay: true,
        },
        {
          type: "vector",
          name: "added-style",
          rasterOverlay: true,
          style: {
            version: 8,
            sources: {
              imagery: {
                type: "raster",
                tiles: ["https://example.test/{z}/{x}/{y}.png"],
              },
              areas: {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
              },
            },
            layers: [
              { id: "photographic", type: "raster", source: "imagery" },
              { id: "areas", type: "fill", source: "areas" },
            ],
          },
        },
      ],
      backgroundStyle: { version: 8, sources: {}, layers: [] },
    });
    const rasters = style.layers!.filter((layer) => layer.type === "raster");
    expect(rasters).toHaveLength(5);
    expect(rasters[0].metadata?.["carma-raster-overlay"]).toBeUndefined();
    expect(
      rasters.slice(1).map((layer) => layer.metadata?.["carma-raster-overlay"])
    ).toEqual([true, true, true, true]);
    expect(
      style.layers!.find((layer) => layer.type === "fill")?.metadata?.[
        "carma-raster-overlay"
      ]
    ).toBe(true);
    expect(
      rasters
        .slice(0, 3)
        .map(
          (layer) => (layer.paint as Record<string, unknown>)["raster-opacity"]
        )
    ).toEqual([0.6, 0.6, 0.6]);
  });
});

it("preserves raster-overlay ownership in incremental composition including style-wrapped rasters", async () => {
  const added: { type: string; metadata?: Record<string, unknown> }[] = [];
  const map = {
    on: vi.fn(),
    getSource: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn((layer) => added.push(layer)),
  };
  const composer = new StyleComposer(map as never);
  composer.addRasterSubStyle(
    "base",
    { type: "wms", url: "https://example.test/wms", layers: "base" },
    { zIndex: 0 }
  );
  for (const nonTiled of [false, true])
    composer.addRasterSubStyle(
      `extra-${nonTiled}`,
      {
        type: "wmts",
        url: "https://example.test/wms",
        layers: "plan",
        rasterOverlay: true,
        nonTiled,
      },
      { zIndex: 1 }
    );
  composer.addTilesSubStyle(
    "xyz",
    {
      type: "tiles",
      name: "xyz",
      url: "https://example.test/{z}/{x}/{y}",
      rasterOverlay: true,
    },
    { zIndex: 2 }
  );
  composer.addCogSubStyle(
    "cog",
    {
      type: "cog",
      name: "cog",
      url: "https://example.test/a.tif",
      rasterOverlay: true,
    },
    { zIndex: 3 }
  );
  await composer.addVectorSubStyle(
    {
      type: "vector",
      name: "wrapped",
      rasterOverlay: true,
      style: {
        version: 8,
        sources: {
          a: { type: "raster", tiles: ["https://example.test/{z}/{x}/{y}"] },
        },
        layers: [{ id: "a", type: "raster", source: "a" }],
      },
    },
    { zIndex: 4 }
  );
  expect(
    added
      .filter((layer) => layer.type === "raster")
      .map((layer) => layer.metadata?.["carma-raster-overlay"])
  ).toEqual([undefined, true, true, true, true, true]);
  expect(
    added
      .filter((layer) => layer.type !== "raster")
      .every((layer) => !layer.metadata?.["carma-raster-overlay"])
  ).toBe(true);
});

it("marks only authored 2D style children in both composition pipelines", async () => {
  const types = [
    "raster",
    "fill",
    "line",
    "circle",
    "heatmap",
    "symbol",
    "background",
    "fill-extrusion",
  ] as const;
  const style = {
    version: 8,
    sources: {
      data: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      raster: {
        type: "raster",
        tiles: ["https://example.test/{z}/{x}/{y}.png"],
      },
    },
    layers: types.map((type) => ({
      id: type,
      type,
      ...(type === "background"
        ? {}
        : { source: type === "raster" ? "raster" : "data" }),
    })),
  } as StyleSpecification;
  const layer = {
    type: "vector" as const,
    name: "authored",
    rasterOverlay: true,
    style,
  };
  const merged = await vectorStylesToMapLibreStyle({
    layers: [layer],
    backgroundStyle: { version: 8, sources: {}, layers: [] },
  });
  const added: {
    id: string;
    type: string;
    metadata?: Record<string, unknown>;
  }[] = [];
  const composer = new StyleComposer({
    on: vi.fn(),
    getSource: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn((layer) => added.push(layer)),
  } as never);
  await composer.addVectorSubStyle(layer, { zIndex: 0 });
  for (const layers of [
    merged.style.layers!,
    added.filter((layer) => !layer.id.startsWith("---")),
  ]) {
    expect(
      layers
        .filter((layer) => layer.type !== "background")
        .map((layer) => [layer.type, layer.metadata?.["carma-raster-overlay"]])
    ).toEqual(
      types
        .filter((type) => type !== "background")
        .map((type) => [
          type,
          ["background", "fill-extrusion"].includes(type) ? undefined : true,
        ])
    );
  }
});

it("marks generated GeoJSON circles and labels in both pipelines, but not their boundary layers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      text: async () => "overlay-fixture",
      json: async () => ({ type: "FeatureCollection", features: [] }),
    }))
  );
  try {
    const merged = await vectorStylesToMapLibreStyle({
      layers: [
        {
          type: "geojson",
          name: "authored-points",
          data: "https://example.test/overlay-points.json",
          rasterOverlay: true,
        },
      ],
      clusteringEnabled: true,
      backgroundStyle: { version: 8, sources: {}, layers: [] },
    });
    const added: { type: string; metadata?: Record<string, unknown> }[] = [];
    const composer = new StyleComposer({
      on: vi.fn(),
      getSource: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn((layer) => added.push(layer)),
    } as never);
    await composer.addGeoJsonSubStyle(
      "authored-points",
      "https://example.test/overlay-points-incremental.json",
      { zIndex: 0, clusteringEnabled: true, rasterOverlay: true }
    );
    for (const layers of [merged.style.layers!, added]) {
      const children = layers.filter(
        (layer) => layer.type === "circle" || layer.type === "symbol"
      );
      expect(children).toHaveLength(4);
      expect(
        children.every(
          (layer) => layer.metadata?.["carma-raster-overlay"] === true
        )
      ).toBe(true);
      expect(
        layers
          .filter((layer) => layer.type === "background")
          .every((layer) => !layer.metadata?.["carma-raster-overlay"])
      ).toBe(true);
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
