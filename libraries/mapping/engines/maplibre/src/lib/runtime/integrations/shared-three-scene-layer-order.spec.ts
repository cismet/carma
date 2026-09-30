// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

vi.mock("./shared-three-scene-layer", () => ({
  buildSharedThreeSceneLayer: vi.fn(),
}));

import { registerSharedThreeSceneRuntime } from "./shared-three-scene-content-registry";
import { acquireSharedThreeScene } from "./shared-three-scene-registry";
import { installSharedThreeSceneRegistryFixture } from "./shared-three-scene-registry.fixture";

describe("shared Three.js scene registry", () => {
  const { sharedLayer } = installSharedThreeSceneRegistryFixture();

  it.each([MAPLIBRE_EVENT.STYLE_DATA, MAPLIBRE_EVENT.STYLE_LOAD])(
    "keeps ground below Three on %s even while point labels are hidden",
    (maintenanceEvent) => {
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

      const lease = acquireSharedThreeScene(map as never, {
        mapStylePresentation: true,
      });

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
      expect(paint.get("autobahn-route-shields:text-halo-color")).toBe(
        "#003399"
      );
      lease.setPointLabelOverlayVisible(false);
      expect(layout.get("place-city:visibility")).toBe("none");
      expect(layout.get("house-numbers:visibility")).toBe("none");
      expect(layout.get("autobahn-route-shields:visibility")).toBe("none");
      expect(paint.get("house-numbers:text-color")).toBe("#112233");
      const appendGroundAndRefresh = (suffix: string) => {
        const lateGround = ["fill", "raster", "line"].map((type) => ({
          id: `${suffix}-${type}`,
          type,
        }));
        layers.push(...lateGround);
        const refresh = map.on.mock.calls.find(
          ([event]) => event === maintenanceEvent
        )?.[1];
        expect(refresh).toBeTypeOf("function");
        refresh({ type: maintenanceEvent });
        // Check synchronously: the label timer must not leave a second native
        // terrain stack behind Three for even one intervening render.
        const order = layers.map(({ id }) => id);
        const receiverIndex = order.indexOf(sharedLayer.id);
        for (const { id } of lateGround) {
          expect(order.indexOf(id)).toBeLessThan(receiverIndex);
          expect(layout.has(`${id}:visibility`)).toBe(false);
        }
        expect(order.slice(receiverIndex + 1)).toEqual([
          "autobahn-route-shields",
          "place-city",
          "house-numbers",
        ]);
        const writes = moveLayer.mock.calls.length;
        refresh({ type: maintenanceEvent });
        expect(moveLayer).toHaveBeenCalledTimes(writes);
      };
      appendGroundAndRefresh("hidden-labels-ground");
      expect(layout.get("place-city:visibility")).toBe("none");
      expect(layout.get("house-numbers:visibility")).toBe("none");
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
      appendGroundAndRefresh("visible-labels-ground");
      lease.release();
      expect(layout.get("place-city:text-offset")).toEqual([0, 0]);
      expect(paint.get("place-city:text-halo-width")).toBe(1.25);
      expect(paint.get("place-city:text-halo-color")).toBe(
        "rgba(255, 255, 255, 0.8)"
      );
      expect(paint.get("place-city:text-color")).toBe("#223344");
    }
  );

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

    const lease = acquireSharedThreeScene(map as never, {
      mapStylePresentation: true,
    });
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
    const nativeTerrain = { source: "dem", exaggeration: 1.5 };
    const map = {
      terrain,
      getTerrain: vi.fn(() => nativeTerrain),
      setTerrain: vi.fn(),
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

    const lease = acquireSharedThreeScene(map as never, {
      mapStylePresentation: true,
    });

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
    // Keep native DEM elevation for labels; only the captured surface is hidden.
    expect(map.getTerrain()).toBe(nativeTerrain);
    expect(map.setTerrain).not.toHaveBeenCalled();

    lease.release();
    expect(map.setTerrain).not.toHaveBeenCalled();
    expect(terrain.getMeshFrameDelta(15)).toBe(42);
    expect(Object.hasOwn(terrain, "getMeshFrameDelta")).toBe(false);
    expect(layout.has("basemap:visibility")).toBe(false);
    expect(paint.get(`${streetLayer.id}:text-color`)).toBe("#333333");
    expect(layout.get(`${streetLayer.id}:text-size`)).toBe(13);
  });

  it("hides the basemap as soon as a terrain mesh registers after the style settled", () => {
    const layers = [
      { id: "basemap", type: "fill" },
      { id: sharedLayer.id, type: "custom" },
    ];
    const layout = new Map<string, unknown>();
    const paint = new Map<string, unknown>();
    const terrain = Object.create({ getMeshFrameDelta: () => 42 }) as {
      getMeshFrameDelta: (zoom: number) => number;
    };
    const map = {
      terrain,
      getTerrain: vi.fn(() => ({ source: "dem", exaggeration: 1 })),
      setTerrain: vi.fn(),
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
    // The style settled with no mesh: the basemap stays visible.
    const lease = acquireSharedThreeScene(map as never, {
      mapStylePresentation: true,
    });
    expect(layout.has("basemap:visibility")).toBe(false);
    // A mesh added from the layer list registers without any style or idle
    // event following; the registration alone has to apply the drape.
    const mesh = {
      id: "mesh",
      providesTerrain: true,
      mapStyleProjectionBlend: "overlay",
      getActiveTileVolumes: () => [],
    };
    sharedLayer.getRuntimes.mockReturnValue([mesh as never]);
    const unregister = registerSharedThreeSceneRuntime(
      map as never,
      mesh as never
    );
    expect(layout.get("basemap:visibility")).toBe("none");
    // Removing it restores the basemap the same way.
    sharedLayer.getRuntimes.mockReturnValue([]);
    unregister();
    expect(layout.has("basemap:visibility")).toBe(false);
    lease.release();
  });
});
