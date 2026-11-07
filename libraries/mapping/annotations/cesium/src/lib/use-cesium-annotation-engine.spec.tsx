import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Scene } from "@carma-cesium";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";

import { useCesiumAnnotationEngine } from "./use-cesium-annotation-engine";

const created: AnnotationEngine[] = [];

vi.mock("./create-cesium-annotation-engine", () => ({
  createCesiumAnnotationEngine: () => {
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

const createScene = () => ({ isDestroyed: () => false } as unknown as Scene);

describe("useCesiumAnnotationEngine", () => {
  it("hands out a live engine after a StrictMode remount", () => {
    created.length = 0;
    const scene = createScene();
    const { result, unmount } = renderHook(
      () => useCesiumAnnotationEngine(scene),
      { wrapper: StrictMode }
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.isDestroyed()).toBe(false);
    unmount();
    expect(created.every((engine) => engine.isDestroyed())).toBe(true);
  });

  it("replaces the engine with the scene and drops it without one", () => {
    created.length = 0;
    const first = createScene();
    const { result, rerender } = renderHook(
      ({ scene }: { scene: Scene | null }) => useCesiumAnnotationEngine(scene),
      { initialProps: { scene: first as Scene | null } }
    );
    const engine = result.current;
    expect(engine).not.toBeNull();
    rerender({ scene: createScene() });
    expect(engine!.isDestroyed()).toBe(true);
    expect(result.current).not.toBe(engine);
    expect(result.current!.isDestroyed()).toBe(false);
    rerender({ scene: null });
    expect(result.current).toBeNull();
  });
});
