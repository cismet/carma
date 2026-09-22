import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileLoadingDebugHost } from "./TileLoadingDebugHost";

const debug = vi.hoisted(() => ({
  enabled: false,
  loaded: false,
  listener: () => {},
}));
vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => ({ isDebugMode: debug.enabled }),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getTiles3dRuntimeHandles: () => (debug.loaded ? [{}] : []),
  subscribeTiles3dRuntimeHandles: (_map: unknown, listener: () => void) => {
    debug.listener = listener;
    return () => {};
  },
}));

const shadow = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  setState: vi.fn(),
}));
vi.mock("@carma-mapping/addons", () => ({
  useAddonState: () => [shadow.state, shadow.setState],
}));
// Local/development mode must not expose a separate debugger entrypoint.
vi.mock("@carma-appframeworks/portals", () => ({
  useDevelopmentUiEnabled: () => true,
}));
vi.mock("@carma-mapping/tile-diagnostics-ui", () => ({
  VolumeTileDiagnostics: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close tile overlay</button>
  ),
  TileLoadingDebug: () => {
    throw new Error("The standalone debugger must not mount in Geoportal");
  },
}));

const createMap = () => {
  const mapContainer = document.createElement("div");
  document.body.appendChild(mapContainer);
  return {
    map: { getContainer: () => mapContainer } as unknown as MaplibreMap,
    mapContainer,
  };
};

beforeEach(() => {
  debug.enabled = false;
  debug.loaded = false;
  shadow.state = {};
  shadow.setState.mockClear();
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("TileLoadingDebugHost", () => {
  it("exposes the existing overlay only for an explicitly flagged mounted mesh, without shadow writes", async () => {
    debug.enabled = true;
    const { map } = createMap();
    render(<TileLoadingDebugHost map={map} />);
    expect(screen.queryByRole("button", { name: "Mesh-Diagnose" })).toBeNull();
    act(() => {
      debug.loaded = true;
      debug.listener();
    });
    fireEvent.click(screen.getByRole("button", { name: "Mesh-Diagnose" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Close tile overlay" })
    );
    expect(shadow.setState).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Mesh-Diagnose" })
    ).not.toBeNull();
    act(() => {
      debug.loaded = false;
      debug.listener();
    });
    expect(screen.queryByRole("button", { name: "Mesh-Diagnose" })).toBeNull();
  });

  it("mounts nothing by default, including in development mode", () => {
    debug.loaded = true;
    const { map, mapContainer } = createMap();
    render(<TileLoadingDebugHost map={map} />);
    expect(mapContainer.innerHTML).toBe("");
  });

  it("opens from shadow option or decoded URL state and unmounts when disabled", async () => {
    const { map, mapContainer } = createMap();
    shadow.state = { showTileDiagnostics: true };
    const { rerender } = render(<TileLoadingDebugHost map={map} />);
    const close = await screen.findByRole("button", {
      name: "Close tile overlay",
    });
    expect(mapContainer.contains(close)).toBe(true);
    expect(
      mapContainer.querySelector(
        '[data-test-id="tile-diagnostics-overlay-root"]'
      )
    ).not.toBeNull();
    shadow.state = { showTileDiagnostics: false };
    rerender(<TileLoadingDebugHost map={map} />);
    expect(mapContainer.innerHTML).toBe("");
  });

  it("closing the overlay clears the shared option and preserves other shadow state", async () => {
    const { map } = createMap();
    shadow.state = { showTileDiagnostics: true, enabled: true };
    render(<TileLoadingDebugHost map={map} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Close tile overlay" })
    );
    expect(shadow.setState).toHaveBeenCalledWith({
      showTileDiagnostics: false,
      enabled: true,
    });
  });

  it("waits for a map container even when requested", () => {
    shadow.state = { showTileDiagnostics: true };
    const { container } = render(<TileLoadingDebugHost map={null} />);
    expect(container.innerHTML).toBe("");
  });
});
