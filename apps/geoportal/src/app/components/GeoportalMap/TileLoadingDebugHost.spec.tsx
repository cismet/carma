import { render, screen } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { TileLoadingDebugHost } from "./TileLoadingDebugHost";

const developmentUi = vi.hoisted(() => ({ enabled: false }));
const registry = vi.hoisted(() => ({
  handles: [] as Array<{ scene: { id: string; providesTerrain: boolean } }>,
}));
vi.mock("@carma-appframeworks/portals", () => ({
  useDevelopmentUiEnabled: () => developmentUi.enabled,
}));
const shadow = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@carma-mapping/addons", () => ({
  useAddonState: () => [shadow.state, vi.fn()],
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getTiles3dRuntimeHandles: () => registry.handles,
  subscribeTiles3dRuntimeHandles: () => () => undefined,
}));
vi.mock("@carma-mapping/tile-diagnostics-ui", () => ({
  TileLoadingDebug: ({
    runtimeHandle,
  }: {
    runtimeHandle: { scene: { id: string } };
  }) => <div data-testid="tile-debugger">{runtimeHandle.scene.id}</div>,
}));

/** The host mounts on the map's own overlay level, so it needs a container. */
const createMap = () => {
  const mapContainer = document.createElement("div");
  document.body.appendChild(mapContainer);
  return {
    map: { getContainer: () => mapContainer } as unknown as MaplibreMap,
    mapContainer,
  };
};

describe("TileLoadingDebugHost", () => {
  it("mounts nothing without the development UI or without a runtime", () => {
    const { map, mapContainer } = createMap();
    registry.handles = [{ scene: { id: "lod2", providesTerrain: false } }];
    developmentUi.enabled = false;
    const { rerender } = render(<TileLoadingDebugHost map={map} />);
    expect(mapContainer.innerHTML).toBe("");
    developmentUi.enabled = true;
    registry.handles = [];
    rerender(<TileLoadingDebugHost map={map} />);
    expect(mapContainer.innerHTML).toBe("");
    // Requested without a tileset: the overview stands on the tile boxes the
    // runtimes report instead of rendering nothing.
    shadow.state = { showTileDiagnostics: true };
    rerender(<TileLoadingDebugHost map={map} />);
    expect(
      mapContainer.querySelector(
        '[data-test-id="tile-diagnostics-without-tileset"]'
      )
    ).not.toBeNull();
    // Everything sits in one overlay root on the map, never in the app tree.
    expect(
      mapContainer.querySelector(
        '[data-test-id="tile-diagnostics-overlay-root"]'
      )
    ).not.toBeNull();
    shadow.state = {};
  });

  it("opens on the shadow panel's request without the development UI", async () => {
    const { map } = createMap();
    developmentUi.enabled = false;
    shadow.state = { showTileDiagnostics: true };
    registry.handles = [{ scene: { id: "mesh", providesTerrain: true } }];
    render(<TileLoadingDebugHost map={map} />);
    expect((await screen.findByTestId("tile-debugger")).textContent).toBe(
      "mesh"
    );
    shadow.state = {};
  });

  it("prefers the terrain-providing mesh runtime", async () => {
    const { map } = createMap();
    developmentUi.enabled = true;
    registry.handles = [
      { scene: { id: "lod2", providesTerrain: false } },
      { scene: { id: "mesh", providesTerrain: true } },
    ];
    render(<TileLoadingDebugHost map={map} />);
    expect((await screen.findByTestId("tile-debugger")).textContent).toBe(
      "mesh"
    );
  });
});
