import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
const store = vi.hoisted(() => ({
  ready: false,
  listeners: new Set<() => void>(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  hasSharedThreeShadedPresentation: () => store.ready,
  subscribeSharedThreeShadedPresentation: (
    _map: unknown,
    listener: () => void
  ) => {
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  },
}));
import { useShadowStartupPresentation } from "./use-shadow-startup-presentation";

describe("shadow startup presentation", () => {
  it("hides only the unshaded canvas until the first custom pass and releases its listener", () => {
    store.ready = false;
    const canvas = document.createElement("canvas");
    canvas.style.visibility = "visible";
    const map = { getCanvas: () => canvas } as unknown as MaplibreMap;
    const { unmount } = renderHook(() =>
      useShadowStartupPresentation(map, true)
    );
    expect(canvas.style.visibility).toBe("hidden");
    act(() => {
      store.ready = true;
      store.listeners.forEach((listener) => listener());
    });
    expect(canvas.style.visibility).toBe("visible");
    unmount();
    expect(store.listeners.size).toBe(0);
  });
  it("restores the canvas if shadows are disabled before their module finishes", () => {
    store.ready = false;
    const canvas = document.createElement("canvas");
    const map = { getCanvas: () => canvas } as unknown as MaplibreMap;
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useShadowStartupPresentation(map, enabled),
      { initialProps: { enabled: true } }
    );
    expect(canvas.style.visibility).toBe("hidden");
    rerender({ enabled: false });
    expect(canvas.style.visibility).toBe("");
    unmount();
  });
});
