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

describe("TileLoadingDebugHost", () => {
  it("mounts nothing without the development UI or without a runtime", () => {
    const map = {} as MaplibreMap;
    registry.handles = [{ scene: { id: "lod2", providesTerrain: false } }];
    developmentUi.enabled = false;
    const { container, rerender } = render(<TileLoadingDebugHost map={map} />);
    expect(container.innerHTML).toBe("");
    developmentUi.enabled = true;
    registry.handles = [];
    rerender(<TileLoadingDebugHost map={map} />);
    expect(container.innerHTML).toBe("");
  });

  it("prefers the terrain-providing mesh runtime", async () => {
    const map = {} as MaplibreMap;
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
