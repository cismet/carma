import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { AnnotationEngine } from "@carma-mapping/annotations/runtime";
import { useMapLibreAnnotationPointQuery } from "./use-maplibre-annotation-point-query";

vi.mock("@carma-mapping/annotations/runtime", () => ({
  useEnginePointQuery: vi.fn(),
}));

const createMap = (initiallyEnabled = true) => {
  let enabled = initiallyEnabled;
  return {
    doubleClickZoom: {
      isEnabled: () => enabled,
      enable: () => {
        enabled = true;
      },
      disable: () => {
        enabled = false;
      },
    },
  } as unknown as MaplibreMap;
};
const engine = {} as AnnotationEngine;

describe("measurement double-click zoom ownership", () => {
  it("only overrides zoom while drawing and restores it on tool-off and unmount", () => {
    const map = createMap();
    const hook = renderHook(
      ({ enabled }) =>
        useMapLibreAnnotationPointQuery(map, engine, { enabled }),
      { initialProps: { enabled: false } }
    );
    expect(map.doubleClickZoom.isEnabled()).toBe(true);
    hook.rerender({ enabled: true });
    expect(map.doubleClickZoom.isEnabled()).toBe(false);
    hook.rerender({ enabled: false });
    expect(map.doubleClickZoom.isEnabled()).toBe(true);
    hook.rerender({ enabled: true });
    hook.unmount();
    expect(map.doubleClickZoom.isEnabled()).toBe(true);
  });
  it("preserves a host's previously disabled zoom", () => {
    const map = createMap(false);
    const hook = renderHook(() =>
      useMapLibreAnnotationPointQuery(map, engine, { enabled: true })
    );
    hook.unmount();
    expect(map.doubleClickZoom.isEnabled()).toBe(false);
  });
});
