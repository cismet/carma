// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("./shared-three-scene-layer", () => ({
  buildSharedThreeSceneLayer: vi.fn(),
}));

import { acquireSharedThreeScene } from "./shared-three-scene-registry";
import { installSharedThreeSceneRegistryFixture } from "./shared-three-scene-registry.fixture";

describe("shared Three.js scene registry", () => {
  const { sharedLayer } = installSharedThreeSceneRegistryFixture();

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

  it("ignores caster-only terrain tiles for the label coverage", () => {
    const listeners = new Map<string, () => void>();
    const placeLayer = {
      id: "place-city",
      type: "symbol",
      source: "basemap",
      "source-layer": "place",
    };
    const layers = [{ id: sharedLayer.id, type: "custom" }, placeLayer];
    let currentFilter: unknown = null;
    const viewportTile = {
      id: "12/34/56",
      kind: "terrain-tile",
      loadReason: "viewport" as const,
      minimum: [-10, 100, -20] as const,
      maximum: [30, 200, 40] as const,
    };
    let volumes = [
      viewportTile,
      {
        id: "12/99/99",
        kind: "terrain-tile",
        loadReason: "shadow" as const,
        minimum: [5_000, 100, 5_000] as const,
        maximum: [6_000, 200, 6_000] as const,
      },
    ];
    const getActiveTileVolumes = vi.fn(() => volumes);
    sharedLayer.getRuntimes.mockReturnValue([
      { id: "terrain", providesTerrain: true, getActiveTileVolumes } as never,
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
    // One coverage box: the caster-only tile never reaches the polygon.
    expect(sharedLayer.projectSceneToLngLat).toHaveBeenCalledTimes(4);
    expect(map.setFilter).toHaveBeenCalledTimes(1);
    // A sun step swaps the caster tiles; the label filter must not be rewritten
    // because MapLibre reloads the whole vector source for a filter change.
    volumes = [
      viewportTile,
      {
        id: "12/98/98",
        kind: "terrain-tile",
        loadReason: "shadow" as const,
        minimum: [-6_000, 100, -6_000] as const,
        maximum: [-5_000, 200, -5_000] as const,
      },
    ];
    listeners.get("styledata")?.();
    vi.advanceTimersByTime(1000);
    expect(getActiveTileVolumes.mock.calls.length).toBeGreaterThan(1);
    expect(sharedLayer.projectSceneToLngLat).toHaveBeenCalledTimes(4);
    expect(map.setFilter).toHaveBeenCalledTimes(1);
    lease.release();
  });
});
