// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

vi.mock("./shared-three-scene-layer", () => ({
  buildSharedThreeSceneLayer: vi.fn(),
}));

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import { acquireSharedThreeScene } from "./shared-three-scene-registry";

describe("shared Three.js scene registry", () => {
  const dispose = vi.fn();
  const sharedLayer = {
    id: "carma-shared-three-scene",
    addRuntime: vi.fn(),
    removeRuntime: vi.fn(),
    getScene: vi.fn(),
    getRuntimes: vi.fn(() => []),
    getRenderer: vi.fn(),
    projectSceneToLngLat: vi.fn(
      (position: readonly [number, number, number]) =>
        [position[0], position[2]] as [number, number]
    ),
    dispose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Label overlay maintenance is rate limited; drive its trailing pass
    // deterministically.
    vi.useFakeTimers();
    sharedLayer.getRuntimes.mockReturnValue([]);
    vi.mocked(buildSharedThreeSceneLayer).mockReturnValue(sharedLayer as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one layer and disposes it after the final lease", () => {
    const listeners = new Map<string, () => void>();
    const addLayer = vi.fn();
    const removeLayer = vi.fn();
    let attached = false;
    addLayer.mockImplementation(() => {
      attached = true;
    });
    removeLayer.mockImplementation(() => {
      attached = false;
    });
    const map = {
      isStyleLoaded: vi.fn(() => true),
      getStyle: vi.fn(() => ({
        layers: [
          { id: "basemap", type: "raster" },
          { id: "roads", type: "line" },
          { id: "labels", type: "symbol" },
        ],
      })),
      getLayer: vi.fn(() => (attached ? sharedLayer : undefined)),
      addLayer,
      removeLayer,
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      off: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    };

    const first = acquireSharedThreeScene(map as never);
    const second = acquireSharedThreeScene(map as never);

    expect(first.layer).toBe(second.layer);
    expect(buildSharedThreeSceneLayer).toHaveBeenCalledOnce();
    expect(addLayer).toHaveBeenCalledWith(sharedLayer);

    first.release();
    expect(dispose).not.toHaveBeenCalled();

    second.release();
    expect(removeLayer).toHaveBeenCalledWith(sharedLayer.id);
    expect(dispose).toHaveBeenCalledOnce();
    expect(listeners.has("styledata")).toBe(false);
    expect(listeners.has(MAPLIBRE_EVENT.STYLE_LOAD)).toBe(false);
    expect(listeners.has("idle")).toBe(false);
  });

  it("adds the layer while sources keep the style in a loading state", () => {
    const addLayer = vi.fn();
    let attached = false;
    addLayer.mockImplementation(() => {
      attached = true;
    });
    const map = {
      isStyleLoaded: vi.fn(() => false),
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => (attached ? sharedLayer : undefined)),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(addLayer).toHaveBeenCalledWith(sharedLayer);
    lease.release();
  });

  it("moves the shared layer after the full style and keeps point labels above it", () => {
    const layers = [
      { id: "basemap", type: "raster" },
      { id: sharedLayer.id, type: "custom" },
      { id: "landcover", type: "fill" },
      { id: "roads", type: "line" },
      {
        id: "road-labels",
        type: "symbol",
        "source-layer": "transportation_name",
        layout: { "symbol-placement": "line" },
      },
      {
        id: "autobahn-route-shields",
        type: "symbol",
        layout: { "symbol-placement": "point" },
      },
      { id: "place-city", type: "symbol", "source-layer": "place" },
      {
        id: "house-numbers",
        type: "symbol",
        "source-layer": "Hausnummer",
      },
    ];
    const moveLayer = vi.fn((id: string, beforeId?: string) => {
      const currentIndex = layers.findIndex((layer) => layer.id === id);
      const [current] = layers.splice(currentIndex, 1);
      const beforeIndex = beforeId
        ? layers.findIndex((layer) => layer.id === beforeId)
        : layers.length;
      layers.splice(beforeIndex, 0, current);
    });
    const layout = new Map<string, unknown>([
      ["place-city:text-offset", [0, 0]],
    ]);
    const paint = new Map<string, unknown>([
      ["place-city:text-halo-width", 1.25],
      ["place-city:text-halo-color", "rgba(255, 255, 255, 0.8)"],
      ["place-city:text-color", "#223344"],
      ["house-numbers:text-halo-color", "rgba(255, 255, 255, 0.8)"],
      ["house-numbers:text-color", "#112233"],
      ["autobahn-route-shields:text-color", "#ffffff"],
      ["autobahn-route-shields:text-halo-color", "#003399"],
    ]);
    const map = {
      getStyle: vi.fn(() => ({
        layers: layers.filter(({ id }) => id !== sharedLayer.id),
      })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      addLayer: vi.fn(),
      moveLayer,
      getLayoutProperty: vi.fn((id: string, property: string) =>
        layout.get(`${id}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) layout.delete(key);
          else layout.set(key, value);
        }
      ),
      getPaintProperty: vi.fn((id: string, property: string) =>
        paint.get(`${id}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) paint.delete(key);
          else paint.set(key, value);
        }
      ),
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(moveLayer).toHaveBeenCalledWith(sharedLayer.id);
    expect(moveLayer).toHaveBeenCalledWith("place-city");
    expect(moveLayer).toHaveBeenCalledWith("house-numbers");
    expect(layers.map(({ id }) => id)).toEqual([
      "basemap",
      "landcover",
      "roads",
      "road-labels",
      sharedLayer.id,
      "autobahn-route-shields",
      "place-city",
      "house-numbers",
    ]);
    expect(layout.get("place-city:text-offset")).toEqual([0, 0]);
    expect(paint.get("place-city:text-translate-anchor")).toBe("viewport");
    expect(paint.get("place-city:text-halo-width")).toBe(1.25);
    lease.setLocationLabelColor("#ffe0aa");
    vi.advanceTimersByTime(1000);
    expect(paint.get("place-city:text-halo-width")).toBe(1.25);
    expect(paint.get("place-city:text-halo-color")).toBe("#ffe0aa");
    expect(paint.get("place-city:text-color")).toBe("#223344");
    expect(paint.has("house-numbers:text-halo-width")).toBe(false);
    expect(paint.get("house-numbers:text-halo-color")).toBe("#ffe0aa");
    expect(paint.get("house-numbers:text-color")).toBe("#112233");
    expect(paint.get("autobahn-route-shields:text-color")).toBe("#ffffff");
    expect(paint.get("autobahn-route-shields:text-halo-color")).toBe("#003399");
    lease.setPointLabelOverlayVisible(false);
    expect(layout.get("place-city:visibility")).toBe("none");
    expect(layout.get("house-numbers:visibility")).toBe("none");
    expect(layout.get("autobahn-route-shields:visibility")).toBe("none");
    expect(paint.get("house-numbers:text-color")).toBe("#112233");
    lease.setPointLabelOverlayVisible(true);
    expect(layout.has("place-city:visibility")).toBe(false);
    expect(layout.has("house-numbers:visibility")).toBe(false);
    expect(layout.has("autobahn-route-shields:visibility")).toBe(false);
    expect(layers.slice(-4).map(({ id }) => id)).toEqual([
      sharedLayer.id,
      "autobahn-route-shields",
      "place-city",
      "house-numbers",
    ]);
    lease.release();
    expect(layout.get("place-city:text-offset")).toEqual([0, 0]);
    expect(paint.get("place-city:text-halo-width")).toBe(1.25);
    expect(paint.get("place-city:text-halo-color")).toBe(
      "rgba(255, 255, 255, 0.8)"
    );
    expect(paint.get("place-city:text-color")).toBe("#223344");
  });

  it("lifts basemap.de place names without lifting line labels", () => {
    const layers = [
      { id: "basemap", type: "fill" },
      { id: sharedLayer.id, type: "custom" },
      {
        id: "bg-basemap_relief::Name_Stadtgemeinde_bis_500000",
        type: "symbol",
        source: "bg-basemap_relief::basemap",
        "source-layer": "Name_Punkt",
      },
      {
        id: "bg-basemap_relief::Name_Staatsgrenze",
        type: "symbol",
        source: "bg-basemap_relief::basemap",
        "source-layer": "Name_Linie",
        layout: { "symbol-placement": "line" },
      },
    ];
    const layout = new Map<string, unknown>();
    const paint = new Map<string, unknown>([
      [
        "bg-basemap_relief::Name_Stadtgemeinde_bis_500000:text-halo-color",
        "rgba(255, 255, 255, 0.8)",
      ],
      [
        "bg-basemap_relief::Name_Stadtgemeinde_bis_500000:text-color",
        "#334455",
      ],
    ]);
    const map = {
      getStyle: vi.fn(() => ({
        layers: layers.filter(({ id }) => id !== sharedLayer.id),
      })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      getLayoutProperty: vi.fn((id: string, property: string) =>
        layout.get(`${id}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) layout.delete(key);
          else layout.set(key, value);
        }
      ),
      getPaintProperty: vi.fn((id: string, property: string) =>
        paint.get(`${id}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) paint.delete(key);
          else paint.set(key, value);
        }
      ),
      addLayer: vi.fn(),
      moveLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);
    lease.setLocationLabelColor("#fff2d8");
    vi.advanceTimersByTime(1000);

    expect(
      layout.has("bg-basemap_relief::Name_Stadtgemeinde_bis_500000:text-offset")
    ).toBe(false);
    expect(
      paint.get(
        "bg-basemap_relief::Name_Stadtgemeinde_bis_500000:text-translate-anchor"
      )
    ).toBe("viewport");
    expect(
      paint.has(
        "bg-basemap_relief::Name_Stadtgemeinde_bis_500000:text-halo-width"
      )
    ).toBe(false);
    expect(
      paint.get(
        "bg-basemap_relief::Name_Stadtgemeinde_bis_500000:text-halo-color"
      )
    ).toBe("#fff2d8");
    expect(
      paint.get("bg-basemap_relief::Name_Stadtgemeinde_bis_500000:text-color")
    ).toBe("#334455");
    expect(layout.has("bg-basemap_relief::Name_Staatsgrenze:text-offset")).toBe(
      false
    );
    lease.release();
  });

  it("styles street names, house numbers and water names for a textured mesh", () => {
    const streetLayer = {
      id: "bg-basemap_relief-Name_Kreis_Gemeindestr",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Verkehrslinie",
      layout: { "symbol-placement": { stops: [[13, "line"]] } },
    };
    const houseLayer = {
      id: "bg-basemap_relief-Hauskoordinate",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Hauskoordinate",
    };
    const waterLayer = {
      id: "bg-basemap_relief-Name_GewaesserF_See_klein",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Gewaesserflaeche",
    };
    const poiLayer = {
      id: "bg-basemap_relief-Name_Gebaeude_oeffentlich",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Gebaeudepunkt",
    };
    const contourLabelLayer = {
      id: "bg-basemap_relief-NameHL_Hoehenlinie_10er",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Hoehenlinie",
      layout: { "symbol-placement": "line" },
    };
    const shieldLayer = {
      id: "bg-basemap_relief-Nummer_Bundesstr",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Verkehrslinie",
      layout: { "symbol-placement": "point" },
    };
    const contourLineLayer = {
      id: "bg-basemap_relief-Hoehenlinie_10er",
      type: "line",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Hoehenlinie",
    };
    const layers = [
      { id: "basemap", type: "fill" },
      contourLineLayer,
      streetLayer,
      { id: sharedLayer.id, type: "custom" },
      houseLayer,
      waterLayer,
      poiLayer,
      shieldLayer,
      contourLabelLayer,
    ];
    const layout = new Map<string, unknown>([
      [`${streetLayer.id}:text-size`, 13],
    ]);
    const paint = new Map<string, unknown>([
      [`${streetLayer.id}:text-color`, "#333333"],
      [`${streetLayer.id}:text-halo-color`, "#ffffff"],
      [`${streetLayer.id}:text-halo-width`, 2],
      [`${streetLayer.id}:text-halo-blur`, 0.5],
      [`${houseLayer.id}:text-color`, "#222222"],
      [`${houseLayer.id}:text-halo-color`, "rgba(255, 255, 255, 0.8)"],
      [`${waterLayer.id}:text-color`, "#1f6fb2"],
      [`${waterLayer.id}:text-halo-color`, "#ffffff"],
      [`${waterLayer.id}:text-halo-width`, 1.5],
      [`${poiLayer.id}:text-color`, "#444444"],
      [`${poiLayer.id}:text-halo-color`, "#cccccc"],
      [`${poiLayer.id}:icon-color`, "#ffffff"],
      [`${shieldLayer.id}:text-color`, "#000000"],
      [`${shieldLayer.id}:text-halo-color`, "#ffffff"],
      [`${contourLabelLayer.id}:text-color`, "#666666"],
      [`${contourLabelLayer.id}:text-halo-width`, 1],
      [`${contourLineLayer.id}:line-opacity`, 0.8],
    ]);
    const map = {
      getStyle: vi.fn(() => ({
        layers: layers.filter(({ id }) => id !== sharedLayer.id),
      })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      getLayoutProperty: vi.fn((id: string, property: string) =>
        layout.get(`${id}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) layout.delete(key);
          else layout.set(key, value);
        }
      ),
      getPaintProperty: vi.fn((id: string, property: string) =>
        paint.get(`${id}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) paint.delete(key);
          else paint.set(key, value);
        }
      ),
      addLayer: vi.fn(),
      moveLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);
    lease.setLocationLabelColor("#fff2d8");
    vi.advanceTimersByTime(1000);

    // Bare terrain: the default rules only tint white halos with the sun.
    expect(paint.get(`${streetLayer.id}:text-color`)).toBe("#333333");
    expect(paint.get(`${houseLayer.id}:text-halo-color`)).toBe("#fff2d8");
    expect(paint.get(`${waterLayer.id}:text-halo-width`)).toBe(1.5);

    lease.setMeshLabelStyle(true);

    expect(paint.get(`${streetLayer.id}:text-color`)).toBe("#ffffff");
    expect(paint.get(`${streetLayer.id}:text-halo-color`)).toBe("#808080");
    expect(paint.get(`${streetLayer.id}:text-halo-width`)).toBe(1.5);
    expect(paint.get(`${streetLayer.id}:text-halo-blur`)).toBe(0);
    expect(layout.get(`${streetLayer.id}:text-size`)).toBe(18.2);
    expect(paint.get(`${houseLayer.id}:text-color`)).toBe("#fff2d8");
    expect(paint.get(`${houseLayer.id}:text-halo-color`)).toBe("#808080");
    expect(paint.get(`${waterLayer.id}:text-color`)).toBe("#1f6fb2");
    expect(paint.get(`${waterLayer.id}:text-halo-width`)).toBe(0);
    expect(paint.get(`${poiLayer.id}:text-color`)).toBe("#fff2d8");
    expect(paint.get(`${poiLayer.id}:text-halo-color`)).toBe("#808080");
    expect(paint.get(`${poiLayer.id}:icon-color`)).toBe("#fff2d8");
    // Shields keep their authored text and halo in every mode.
    expect(paint.get(`${shieldLayer.id}:text-color`)).toBe("#000000");
    expect(paint.get(`${shieldLayer.id}:text-halo-color`)).toBe("#ffffff");
    expect(paint.get(`${contourLabelLayer.id}:text-color`)).toBe("#fff2d8");
    expect(paint.get(`${contourLabelLayer.id}:text-halo-width`)).toBe(0);
    // The drape below Three keeps symbols and contour lines only.
    expect(layout.get("basemap:visibility")).toBe("none");
    expect(layout.has(`${contourLineLayer.id}:visibility`)).toBe(false);
    expect(paint.get(`${contourLineLayer.id}:line-opacity`)).toBe(0.5);
    expect(layout.has(`${streetLayer.id}:visibility`)).toBe(false);

    lease.setMeshLabelStyle(false);

    expect(paint.get(`${streetLayer.id}:text-color`)).toBe("#333333");
    expect(paint.get(`${streetLayer.id}:text-halo-color`)).toBe("#ffffff");
    expect(paint.get(`${streetLayer.id}:text-halo-width`)).toBe(2);
    expect(paint.get(`${streetLayer.id}:text-halo-blur`)).toBe(0.5);
    expect(layout.get(`${streetLayer.id}:text-size`)).toBe(13);
    expect(paint.get(`${houseLayer.id}:text-color`)).toBe("#222222");
    expect(paint.get(`${houseLayer.id}:text-halo-color`)).toBe("#fff2d8");
    expect(paint.get(`${waterLayer.id}:text-halo-width`)).toBe(1.5);
    expect(paint.get(`${poiLayer.id}:text-color`)).toBe("#444444");
    expect(paint.get(`${poiLayer.id}:text-halo-color`)).toBe("#cccccc");
    expect(paint.get(`${poiLayer.id}:icon-color`)).toBe("#ffffff");
    expect(paint.get(`${contourLabelLayer.id}:text-color`)).toBe("#666666");
    expect(paint.get(`${contourLabelLayer.id}:text-halo-width`)).toBe(1);
    expect(layout.has("basemap:visibility")).toBe(false);
    expect(paint.get(`${contourLineLayer.id}:line-opacity`)).toBe(0.8);

    lease.release();
    expect(paint.get(`${houseLayer.id}:text-halo-color`)).toBe(
      "rgba(255, 255, 255, 0.8)"
    );
  });

  it("lifts place names by meters above the map center and tints white sprites", () => {
    const placeLayer = {
      id: "bg-basemap_relief::Name_Ortsteil_Stadtteil",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Name_Punkt",
    };
    const poiLayer = {
      id: "bg-basemap_relief::Name_Gebaeude_oeffentlich",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Gebaeudepunkt",
    };
    const layers = [
      { id: sharedLayer.id, type: "custom" },
      placeLayer,
      poiLayer,
    ];
    const paint = new Map<string, unknown>();
    const listeners = new Map<string, () => void>();
    const images = new Map<
      string,
      { width: number; height: number; data: Uint8Array }
    >([
      [
        "church",
        {
          width: 2,
          height: 1,
          data: new Uint8Array([255, 255, 255, 255, 20, 20, 20, 255]),
        },
      ],
      [
        "school",
        {
          width: 2,
          height: 1,
          data: new Uint8Array([120, 60, 20, 255, 250, 250, 250, 255]),
        },
      ],
      [
        "shield",
        {
          width: 2,
          height: 1,
          data: new Uint8Array([255, 220, 0, 255, 255, 255, 255, 255]),
        },
      ],
    ]);
    let zoom = 16;
    const map = {
      getStyle: vi.fn(() => ({ layers: [placeLayer, poiLayer] })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      getZoom: vi.fn(() => zoom),
      getPitch: vi.fn(() => 0),
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getCanvas: vi.fn(() => ({ clientHeight: 2000 })),
      getLayoutProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      getPaintProperty: vi.fn((id: string, property: string) =>
        paint.get(`${id}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) paint.delete(key);
          else paint.set(key, value);
        }
      ),
      listImages: vi.fn(() => [...images.keys()]),
      hasImage: vi.fn((id: string) => images.has(id)),
      updateImage: vi.fn((id: string, image: { data: Uint8Array }) => {
        images.set(id, {
          ...images.get(id)!,
          data: new Uint8Array(image.data),
        });
      }),
      style: {
        imageManager: {
          getImage: (id: string) => ({ data: images.get(id), sdf: false }),
        },
      },
      addLayer: vi.fn(),
      moveLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    // 300 m at zoom 16 on the equator: 512 * 2^16 / 40075016.686 px per meter.
    const expectedPixels = (300 * 512 * 2 ** 16) / 40075016.686;
    expect(paint.get(`${placeLayer.id}:text-translate-anchor`)).toBe(
      "viewport"
    );
    const [, lifted] = paint.get(`${placeLayer.id}:text-translate`) as [
      number,
      number
    ];
    expect(-lifted).toBeCloseTo(expectedPixels, 3);
    const [, liftedPoi] = paint.get(`${poiLayer.id}:text-translate`) as [
      number,
      number
    ];
    expect(-liftedPoi).toBeCloseTo((expectedPixels * 10) / 300, 3);

    zoom = 17;
    listeners.get("move")?.();
    const [, liftedCloser] = paint.get(`${placeLayer.id}:text-translate`) as [
      number,
      number
    ];
    expect(-liftedCloser).toBeCloseTo(expectedPixels * 2, 3);

    // Sprites follow the sun color only with the mesh label style, and only
    // the flat white ones.
    lease.setLocationLabelColor("#ff8000");
    vi.advanceTimersByTime(1000);
    expect([...images.get("church")!.data]).toEqual([
      255, 255, 255, 255, 20, 20, 20, 255,
    ]);
    lease.setMeshLabelStyle(true);
    // Every sprite is lit by the sun color: albedo times light per channel.
    expect([...images.get("church")!.data]).toEqual([
      255, 128, 0, 255, 20, 10, 0, 255,
    ]);
    expect([...images.get("school")!.data]).toEqual([
      120, 30, 0, 255, 250, 125, 0, 255,
    ]);
    expect([...images.get("shield")!.data]).toEqual([
      255, 110, 0, 255, 255, 128, 0, 255,
    ]);
    lease.setMeshLabelStyle(false);
    expect([...images.get("church")!.data]).toEqual([
      255, 255, 255, 255, 20, 20, 20, 255,
    ]);
    expect([...images.get("school")!.data]).toEqual([
      120, 60, 20, 255, 250, 250, 250, 255,
    ]);
    expect([...images.get("shield")!.data]).toEqual([
      255, 220, 0, 255, 255, 255, 255, 255,
    ]);

    lease.release();
    expect(paint.has(`${placeLayer.id}:text-translate`)).toBe(false);
    expect(paint.has(`${placeLayer.id}:text-translate-anchor`)).toBe(false);
  });

  it("drapes a textured terrain mesh without the shadow simulation", () => {
    sharedLayer.getRuntimes.mockReturnValue([
      {
        id: "mesh",
        providesTerrain: true,
        mapStyleProjectionBlend: "overlay",
        getActiveTileVolumes: () => [],
      } as never,
    ]);
    const streetLayer = {
      id: "bg-basemap_relief-Name_Kreis_Gemeindestr",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Verkehrslinie",
      layout: { "symbol-placement": "line" },
    };
    const poiLayer = {
      id: "bg-basemap_relief-Name_Gebaeude_oeffentlich",
      type: "symbol",
      source: "bg-basemap_relief::basemap",
      "source-layer": "Gebaeudepunkt",
    };
    const layers = [
      { id: "basemap", type: "fill" },
      streetLayer,
      { id: sharedLayer.id, type: "custom" },
      poiLayer,
    ];
    const layout = new Map<string, unknown>([
      [`${streetLayer.id}:text-size`, 13],
    ]);
    const paint = new Map<string, unknown>([
      [`${streetLayer.id}:text-color`, "#333333"],
      [`${streetLayer.id}:text-halo-color`, "#ffffff"],
      [`${poiLayer.id}:text-color`, "#444444"],
      [`${poiLayer.id}:text-halo-color`, "#ffffff"],
    ]);
    const terrain = Object.create({ getMeshFrameDelta: () => 42 }) as {
      getMeshFrameDelta: (zoom: number) => number;
    };
    const map = {
      terrain,
      getStyle: vi.fn(() => ({
        layers: layers.filter(({ id }) => id !== sharedLayer.id),
      })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      getLayoutProperty: vi.fn((id: string, property: string) =>
        layout.get(`${id}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) layout.delete(key);
          else layout.set(key, value);
        }
      ),
      getPaintProperty: vi.fn((id: string, property: string) =>
        paint.get(`${id}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (id: string, property: string, value: unknown) => {
          const key = `${id}:${property}`;
          if (value == null) paint.delete(key);
          else paint.set(key, value);
        }
      ),
      getFilter: vi.fn(),
      setFilter: vi.fn(),
      addLayer: vi.fn(),
      moveLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    // Drape and street styling apply on their own; without a sun color the
    // point labels keep their authored paint.
    expect(layout.get("basemap:visibility")).toBe("none");
    expect(paint.get(`${streetLayer.id}:text-color`)).toBe("#ffffff");
    expect(paint.get(`${streetLayer.id}:text-halo-color`)).toBe("#808080");
    expect(layout.get(`${streetLayer.id}:text-size`)).toBe(18.2);
    expect(paint.get(`${poiLayer.id}:text-color`)).toBe("#444444");
    expect(paint.get(`${poiLayer.id}:text-halo-color`)).toBe("#ffffff");
    // MapLibre's tile skirts stay out of the captured pass.
    expect(terrain.getMeshFrameDelta(15)).toBe(0);

    lease.release();
    expect(terrain.getMeshFrameDelta(15)).toBe(42);
    expect(Object.hasOwn(terrain, "getMeshFrameDelta")).toBe(false);
    expect(layout.has("basemap:visibility")).toBe(false);
    expect(paint.get(`${streetLayer.id}:text-color`)).toBe("#333333");
    expect(layout.get(`${streetLayer.id}:text-size`)).toBe(13);
  });

  it("shows place names only inside active Three terrain tile footprints", () => {
    const placeLayer = {
      id: "place-city",
      type: "symbol",
      source: "basemap",
      "source-layer": "place",
    };
    const layers = [{ id: sharedLayer.id, type: "custom" }, placeLayer];
    const originalFilter = ["==", "class", "city"];
    let currentFilter: unknown = originalFilter;
    sharedLayer.getRuntimes.mockReturnValue([
      {
        id: "terrain",
        providesTerrain: true,
        getActiveTileVolumes: () => [
          {
            id: "12/34/56",
            kind: "terrain-tile",
            minimum: [-10, 100, -20] as const,
            maximum: [30, 200, 40] as const,
          },
        ],
      } as never,
    ]);
    const map = {
      getStyle: vi.fn(() => ({ layers: [placeLayer] })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      getFilter: vi.fn(() => currentFilter),
      setFilter: vi.fn((_id: string, filter: unknown) => {
        currentFilter = filter;
      }),
      getLayoutProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      getPaintProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      addLayer: vi.fn(),
      moveLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(currentFilter).toEqual([
      "all",
      ["==", ["get", "class"], "city"],
      [
        "within",
        {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [-10.5, -20.5],
                [30.5, -20.5],
                [30.5, 40.5],
                [-10.5, 40.5],
                [-10.5, -20.5],
              ],
            ],
          ],
        },
      ],
    ]);

    lease.release();
    expect(currentFilter).toEqual(originalFilter);
  });

  it("merges adjacent terrain tiles into one coverage polygon", () => {
    const placeLayer = {
      id: "place-city",
      type: "symbol",
      source: "basemap",
      "source-layer": "place",
    };
    const layers = [{ id: sharedLayer.id, type: "custom" }, placeLayer];
    let currentFilter: unknown = null;
    const tile = (id: string, x: number, z: number) => ({
      id,
      kind: "terrain-tile",
      minimum: [x, 100, z] as const,
      maximum: [x + 10, 200, z + 10] as const,
    });
    sharedLayer.getRuntimes.mockReturnValue([
      {
        id: "terrain",
        providesTerrain: true,
        getActiveTileVolumes: () => [
          tile("0/0", 0, 0),
          tile("1/0", 10, 0),
          tile("0/1", 0, 10),
          tile("1/1", 10, 10),
        ],
      } as never,
    ]);
    const map = {
      getStyle: vi.fn(() => ({ layers: [placeLayer] })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      getFilter: vi.fn(() => currentFilter),
      setFilter: vi.fn((_id: string, filter: unknown) => {
        currentFilter = filter;
      }),
      getLayoutProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      getPaintProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      addLayer: vi.fn(),
      moveLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(map.setFilter).toHaveBeenCalledOnce();
    expect(currentFilter).toEqual([
      "within",
      {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-0.5, -0.5],
              [20.5, -0.5],
              [20.5, 20.5],
              [-0.5, 20.5],
              [-0.5, -0.5],
            ],
          ],
        ],
      },
    ]);

    // Unchanged coverage and an untouched filter skip the rewrite entirely.
    vi.advanceTimersByTime(1000);
    lease.setLocationLabelColor("#fff2d8");
    vi.advanceTimersByTime(1000);
    expect(map.setFilter).toHaveBeenCalledOnce();
    lease.release();
  });

  it("reuses terrain coverage until the active tile footprints change", () => {
    const listeners = new Map<string, () => void>();
    const placeLayer = {
      id: "place-city",
      type: "symbol",
      source: "basemap",
      "source-layer": "place",
    };
    const layers = [{ id: sharedLayer.id, type: "custom" }, placeLayer];
    let currentFilter: unknown = null;
    let volumes = [
      {
        id: "12/34/56",
        kind: "terrain-tile",
        minimum: [-10, 100, -20] as const,
        maximum: [30, 200, 40] as const,
      },
    ];
    const getActiveTileVolumes = vi.fn(() => volumes);
    sharedLayer.getRuntimes.mockReturnValue([
      {
        id: "terrain",
        providesTerrain: true,
        getActiveTileVolumes,
      } as never,
    ]);
    const map = {
      getStyle: vi.fn(() => ({ layers: [placeLayer] })),
      getLayersOrder: vi.fn(() => layers.map(({ id }) => id)),
      getLayer: vi.fn((id: string) =>
        id === sharedLayer.id
          ? { implementation: sharedLayer }
          : layers.find((layer) => layer.id === id)
      ),
      getFilter: vi.fn(() => currentFilter),
      setFilter: vi.fn((_id: string, filter: unknown) => {
        currentFilter = filter;
      }),
      getLayoutProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      getPaintProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      addLayer: vi.fn(),
      moveLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(getActiveTileVolumes).toHaveBeenCalledOnce();
    expect(sharedLayer.projectSceneToLngLat).toHaveBeenCalledTimes(4);

    listeners.get("styledata")?.();
    listeners.get("idle")?.();
    lease.setLocationLabelColor("#fff2d8");

    // Events inside the maintenance interval collapse into one trailing pass.
    expect(getActiveTileVolumes).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(getActiveTileVolumes).toHaveBeenCalledTimes(2);
    expect(sharedLayer.projectSceneToLngLat).toHaveBeenCalledTimes(4);

    volumes = [
      {
        id: "12/34/56",
        kind: "terrain-tile",
        minimum: [-20, 100, -30] as const,
        maximum: [40, 200, 50] as const,
      },
    ];
    listeners.get("styledata")?.();
    vi.advanceTimersByTime(1000);

    expect(getActiveTileVolumes).toHaveBeenCalledTimes(3);
    expect(sharedLayer.projectSceneToLngLat).toHaveBeenCalledTimes(8);
    lease.release();
  });

  it("does not redraw raster label overlays above Three", () => {
    const addLayer = vi.fn();
    const map = {
      getStyle: vi.fn(() => ({
        layers: [
          { id: "basemap", type: "raster" },
          {
            id: "---raster-spw2-light-grundriss-0:first---",
            type: "background",
          },
          {
            id: "raster-spw2-light-grundriss-0-raster",
            type: "raster",
          },
          { id: "raster-dop-overlay-1-raster", type: "raster" },
        ],
      })),
      getLayer: vi.fn(() => undefined),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(addLayer).toHaveBeenCalledWith(sharedLayer);
    lease.release();
  });

  it("retries after the host style becomes writable", () => {
    const listeners = new Map<string, () => void>();
    let attached = false;
    const addLayer = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("Style is not done loading");
      })
      .mockImplementation(() => {
        attached = true;
      });
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => (attached ? sharedLayer : undefined)),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);
    expect(attached).toBe(false);

    listeners.get(MAPLIBRE_EVENT.STYLE_LOAD)?.();

    expect(attached).toBe(true);
    expect(addLayer).toHaveBeenCalledTimes(2);
    lease.release();
  });

  it("reuses a mounted shared layer after the module registry was replaced", () => {
    const mountedLayer = {
      ...sharedLayer,
      addRuntime: vi.fn(),
      removeRuntime: vi.fn(),
      getScene: vi.fn(),
    };
    const addLayer = vi.fn();
    const removeLayer = vi.fn();
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => ({ implementation: mountedLayer })),
      addLayer,
      removeLayer,
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(lease.layer).toBe(mountedLayer);
    expect(buildSharedThreeSceneLayer).not.toHaveBeenCalled();
    expect(addLayer).not.toHaveBeenCalled();

    lease.release();
    expect(removeLayer).toHaveBeenCalledWith(mountedLayer.id);
    expect(mountedLayer.dispose).toHaveBeenCalledOnce();
  });

  it("does not remove a newer shared layer when an old lease releases", () => {
    const replacementLayer = {
      ...sharedLayer,
      addRuntime: vi.fn(),
      removeRuntime: vi.fn(),
      getScene: vi.fn(),
    };
    const removeLayer = vi.fn();
    let mountedLayer: unknown = sharedLayer;
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => ({ implementation: mountedLayer })),
      addLayer: vi.fn(),
      removeLayer,
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);
    mountedLayer = replacementLayer;
    lease.release();

    expect(removeLayer).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("tolerates MapLibre style teardown during HMR", () => {
    const addLayer = vi.fn(() => {
      throw new Error("style is gone");
    });
    const map = {
      getStyle: vi.fn(() => {
        throw new Error("style is gone");
      }),
      getLayer: vi.fn(() => {
        throw new Error("style is gone");
      }),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(lease.layer).toBe(sharedLayer);
    expect(addLayer).toHaveBeenCalledWith(sharedLayer);
    expect(() => lease.release()).not.toThrow();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
