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
  runtime: {},
  listener: () => {},
}));
vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => ({ isDebugMode: debug.enabled }),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getTiles3dRuntimeHandles: () => (debug.loaded ? [debug.runtime] : []),
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
  TileLoadingDebug: ({
    onOpenChange,
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="toolbar" aria-label="Tile manager diagnostics">
      <button onClick={() => onOpenChange(!open)}>
        {open ? "Close mesh debugger" : "Open mesh debugger"}
      </button>
    </div>
  ),
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
  it("keeps the same draggable debugger mounted across shadow toggles and closing", async () => {
    debug.enabled = true;
    const { map } = createMap();
    const { rerender } = render(<TileLoadingDebugHost map={map} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
    act(() => {
      debug.loaded = true;
      debug.listener();
    });
    const close = await screen.findByRole("button", {
      name: "Close mesh debugger",
    });
    const toolbar = screen.getByRole("toolbar");
    shadow.state = { enabled: true };
    rerender(<TileLoadingDebugHost map={map} />);
    expect(screen.getByRole("toolbar")).toBe(toolbar);
    shadow.state = { enabled: false };
    rerender(<TileLoadingDebugHost map={map} />);
    expect(screen.getByRole("toolbar")).toBe(toolbar);
    fireEvent.click(close);
    expect(screen.getByRole("toolbar")).toBe(toolbar);
    fireEvent.click(screen.getByRole("button", { name: "Open mesh debugger" }));
    expect(
      screen.getByRole("button", { name: "Close mesh debugger" })
    ).not.toBeNull();
    expect(shadow.setState).not.toHaveBeenCalled();
    act(() => {
      debug.loaded = false;
      debug.listener();
    });
    expect(screen.queryByRole("toolbar")).toBeNull();
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
