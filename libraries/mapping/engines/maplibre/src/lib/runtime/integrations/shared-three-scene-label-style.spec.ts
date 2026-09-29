// @vitest-environment node

import { EARTH_CIRCUMFERENCE } from "@carma-geo/proj";
import { describe, expect, it, vi } from "vitest";

vi.mock("./shared-three-scene-layer", () => ({
  buildSharedThreeSceneLayer: vi.fn(),
}));

import { acquireSharedThreeScene } from "./shared-three-scene-registry";
import { installSharedThreeSceneRegistryFixture } from "./shared-three-scene-registry.fixture";

describe("shared Three.js scene registry", () => {
  const { sharedLayer } = installSharedThreeSceneRegistryFixture();

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
    expect(layout.get(`${houseLayer.id}:visibility`)).toBe("none");
    expect(layout.get(`${contourLineLayer.id}:visibility`)).toBe("none");
    expect(layout.get(`${contourLabelLayer.id}:visibility`)).toBe("none");
    lease.setMapStyleElevationVisibility(true, false);
    expect(layout.has(`${contourLineLayer.id}:visibility`)).toBe(false);
    expect(layout.get(`${contourLabelLayer.id}:visibility`)).toBe("none");
    lease.setMapStyleElevationVisibility(false, true);
    expect(layout.get(`${contourLineLayer.id}:visibility`)).toBe("none");
    expect(layout.has(`${contourLabelLayer.id}:visibility`)).toBe(false);
    lease.setMapStyleElevationVisibility(true, true);
    lease.setPointLabelOverlayVisible(false);
    lease.setPointLabelOverlayVisible(true);
    expect(layout.get(`${houseLayer.id}:visibility`)).toBe("none");
    expect(layout.has(`${contourLabelLayer.id}:visibility`)).toBe(false);
    const writes = map.setLayoutProperty.mock.calls.length;
    lease.setMapStyleElevationVisibility(true, true);
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(writes);
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
    expect(layout.has(`${houseLayer.id}:visibility`)).toBe(false);
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

    // 300 m at zoom 16 on the equator: 512 * 2^16 / circumference px per meter.
    const expectedPixels = (300 * 512 * 2 ** 16) / EARTH_CIRCUMFERENCE;
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
});
