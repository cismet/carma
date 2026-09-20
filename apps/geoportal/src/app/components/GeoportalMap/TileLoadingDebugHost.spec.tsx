import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileLoadingDebugHost } from "./TileLoadingDebugHost";

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
  shadow.state = {};
  shadow.setState.mockClear();
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("TileLoadingDebugHost", () => {
  it("mounts nothing by default, including in development mode", () => {
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
