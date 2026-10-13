import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useMapLibreLabelOverlayHost } from "./use-maplibre-label-overlay-host";

describe("MapLibre annotation layout frame host", () => {
  it("waits for the scene frame and lays out before its pre-render placements", () => {
    const map = { on: vi.fn(), off: vi.fn() } as unknown as MaplibreMap;
    const frameUpdates: Array<() => void> = [];
    const order: string[] = [];
    const { result, unmount } = renderHook(() =>
      useMapLibreLabelOverlayHost({
        map,
        containerRef: { current: document.createElement("div") },
        forceLayoutOnPortalRender: false,
        layoutFrameSubscription: (updateLayout) => {
          frameUpdates.push(updateLayout);
          return () => {
            frameUpdates.splice(frameUpdates.indexOf(updateLayout), 1);
          };
        },
      })
    );
    expect(result.current.forceLayoutOnPortalRender).toBe(false);
    const cleanup = result.current.subscribeFrame(() => order.push("layout"));
    expect(order).toEqual([]);
    expect(map.on).not.toHaveBeenCalled();
    frameUpdates.forEach((update) => update());
    order.push("collision", "stems");
    expect(order).toEqual(["layout", "collision", "stems"]);
    if (typeof cleanup === "function") cleanup();
    expect(frameUpdates).toHaveLength(0);
    unmount();
  });

  it("keeps the default portal-layout behavior of other MapLibre hosts", () => {
    const { result, unmount } = renderHook(() =>
      useMapLibreLabelOverlayHost({
        map: null,
        containerRef: { current: null },
      })
    );
    expect(result.current.forceLayoutOnPortalRender).toBe(true);
    unmount();
  });
});
