import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";

import type { MapLibreAnnotationEngineOptions } from "./create-maplibre-annotation-engine";
import { useMapLibreAnnotationEngine } from "./use-maplibre-annotation-engine";

const created: AnnotationEngine[] = [];

vi.mock("./create-maplibre-annotation-engine", () => ({
  createMapLibreAnnotationEngine: () => {
    let disposed = false;
    const engine = {
      isDestroyed: () => disposed,
      dispose: () => {
        disposed = true;
      },
    } as unknown as AnnotationEngine;
    created.push(engine);
    return engine;
  },
}));

const map = {} as MaplibreMap;

describe("useMapLibreAnnotationEngine", () => {
  it("hands out a live engine after a StrictMode remount", () => {
    created.length = 0;
    const { result, unmount } = renderHook(
      () => useMapLibreAnnotationEngine(map),
      { wrapper: StrictMode }
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.isDestroyed()).toBe(false);
    unmount();
    expect(created.every((engine) => engine.isDestroyed())).toBe(true);
  });

  it("replaces the engine with the options and drops it without a map", () => {
    created.length = 0;
    const { result, rerender } = renderHook(
      (props: {
        map: MaplibreMap | null;
        options?: MapLibreAnnotationEngineOptions;
      }) => useMapLibreAnnotationEngine(props.map, props.options),
      { initialProps: { map: map as MaplibreMap | null, options: {} } }
    );
    const engine = result.current;
    expect(engine).not.toBeNull();
    rerender({ map, options: {} });
    expect(engine!.isDestroyed()).toBe(true);
    expect(result.current).not.toBe(engine);
    rerender({ map: null, options: {} });
    expect(result.current).toBeNull();
  });
});
