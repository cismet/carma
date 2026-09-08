import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";

import { ShadowTiledScene } from "./shadow-tiled-scene";
import { TiledShadowRenderer } from "./tiled-shadow-renderer";
import { ShadowCorridorAccumulator } from "./shadow-corridor-accumulator";

vi.mock("./tiled-shadow-renderer", () => ({ TiledShadowRenderer: vi.fn() }));
vi.mock("./shadow-corridor-accumulator", () => ({
  ShadowCorridorAccumulator: vi.fn(),
}));

describe("Geoportal tiled scene adapter", () => {
  const fixture = () => {
    const pages = {
      setView: vi.fn(),
      renderSample: vi.fn(),
      renderPageSample: vi.fn(),
      accumulationPages: [{ id: "64:1:0", revision: "initial", receiverBounds: new THREE.Box3(), screenBounds: new THREE.Vector4() }],
      clearCache: vi.fn(),
      invalidateCasters: vi.fn(),
      dispose: vi.fn(),
      setPrewarmView: vi.fn(),
      clearPrewarmView: vi.fn(),
      prewarmPages: [
        {
          id: "64:1:0",
          receiverBounds: new THREE.Box3(),
          casterBounds: new THREE.Box3(),
          width: 64,
          height: 64,
          samples: 1,
          sampleBudget: 1,
          cachedSamples: 0,
          limited: false,
          canPrewarm: true,
        },
      ],
      prewarmNext: vi.fn(() => ({
        pageId: "64:1:0",
        rendered: 1 as const,
        cachedSamples: 1,
        totalSamples: 1,
        complete: true,
        budgetLimited: false,
        aborted: false,
      })),
    };
    vi.mocked(TiledShadowRenderer).mockImplementation(() => pages as never);
    const accumulation = {
      render: vi.fn(),
      dispose: vi.fn(),
      pageProgress: [{ id: "64:1:0", samples: 5, totalSamples: 16 }],
      memoryBytes: 1024,
      fallbackReason: null,
      presentation: { beginFrame: vi.fn(), render: vi.fn((_scene, _page, _samples, draw) => draw()), capture: vi.fn((_scene, draw) => draw()), stats: {} },
    };
    vi.mocked(ShadowCorridorAccumulator).mockImplementation(
      () => accumulation as never
    );
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    const sky = new THREE.Mesh();
    const overlay = new THREE.Group();
    const terrain = new THREE.Mesh();
    scene.add(light, sky, overlay, terrain);
    const renderer = { autoClear: true, render: vi.fn() };
    const adapter = new ShadowTiledScene(scene, renderer as never, {
      light,
      sky,
      overlay,
      maximumMapSize: 2048,
    });
    return {
      adapter,
      pages,
      accumulation,
      scene,
      light,
      sky,
      overlay,
      terrain,
      renderer,
    };
  };

  it("delegates native corridor frames and only signals settlement transitions", () => {
    const f = fixture();
    const camera = new THREE.Camera();
    const frame = {
      width: 2400,
      height: 1800,
      viewKey: "pose",
      styleEpoch: 1,
      samples: 16,
      active: true,
    };
    f.accumulation.render.mockImplementation(() => {
      expect(f.terrain.visible).toBe(true);
      expect(f.light.visible).toBe(false);
      expect(f.sky.visible).toBe(false);
      expect(f.overlay.visible).toBe(false);
      expect(f.renderer.autoClear).toBe(false);
      return { progress: 1, settled: true, needsRepaint: false };
    });
    expect(f.adapter.renderProgressive(camera, frame)?.settled).toBe(true);
    expect(f.adapter.renderProgressive(camera, frame)?.settled).toBe(false);
    expect(f.accumulation.render).toHaveBeenLastCalledWith(
      camera,
      f.pages,
      expect.objectContaining({ ...frame, visibilityOnly: true })
    );
    expect(f.pages.renderSample).not.toHaveBeenCalled();
    expect(f.scene.children.every((child) => child.visible)).toBe(true);
    expect(f.renderer.autoClear).toBe(true);
    expect(f.adapter.stats.corridorAccumulation).toEqual({
      retained: {},
      pageSamples: f.accumulation.pageProgress,
      memoryBytes: 1024,
      fallbackReason: null,
    });
    f.accumulation.render.mockReturnValueOnce(null);
    expect(f.adapter.renderProgressive(camera, frame)).toBeNull();
    expect(f.adapter.renderProgressive(camera, frame)?.settled).toBe(true);
    f.adapter.dispose();
    expect(f.accumulation.dispose).toHaveBeenCalledOnce();
  });

  it("restores host visibility and clearing after a corridor render error", () => {
    const f = fixture();
    f.accumulation.render.mockImplementation(() => {
      throw new Error("corridor draw");
    });
    expect(() =>
      f.adapter.renderProgressive(new THREE.Camera(), {
        width: 800,
        height: 600,
        viewKey: "pose",
        styleEpoch: 0,
        samples: 16,
        active: true,
      })
    ).toThrow("corridor draw");
    expect(f.scene.children.every((child) => child.visible)).toBe(true);
    expect(f.renderer.autoClear).toBe(true);
    expect(f.pages.renderSample).not.toHaveBeenCalled();
  });

  it("renders atmosphere once, hides only the mono light and restores host state even on failure", () => {
    const f = fixture();
    f.renderer.render.mockImplementationOnce(() => {
      expect(f.sky.visible).toBe(true);
      expect(f.terrain.visible).toBe(false);
      expect(f.light.visible).toBe(false);
    });
    f.pages.renderPageSample.mockImplementation(() => {
      expect(f.terrain.visible).toBe(true);
      expect(f.sky.visible).toBe(false);
      expect(f.overlay.visible).toBe(false);
      expect(f.light.visible).toBe(false);
    });
    const camera = new THREE.Camera();
    f.adapter.render(camera, 5, 128);
    expect(f.pages.renderPageSample).toHaveBeenCalledWith(camera, "64:1:0", 5, 128);
    expect(f.renderer.render).toHaveBeenCalledTimes(2);
    expect(f.scene.children.every((c) => c.visible)).toBe(true);
    expect(f.renderer.autoClear).toBe(true);
    f.pages.renderPageSample.mockImplementationOnce(() => {
      throw new Error("shader");
    });
    expect(() => f.adapter.render(camera, null, 128)).toThrow("shader");
    expect(f.pages.renderPageSample).toHaveBeenLastCalledWith(camera, "64:1:0", 0, 1);
    expect(f.scene.children.every((c) => c.visible)).toBe(true);
    expect(f.renderer.autoClear).toBe(true);
  });

  it("avoids repeated page planning per disc round and invalidates content separately from view", () => {
    const f = fixture();
    const frame = {
      renderCamera: new THREE.Camera(),
      viewport: new THREE.Vector2(1440, 900),
    } as SharedThreeSceneFrame;
    const lighting = {
      directionToSun: new THREE.Vector3(0, 1, 0),
      color: "white",
      intensity: 1,
      shadowIntensity: 1,
    };
    f.adapter.update([], frame, lighting, 0.5);
    f.adapter.update([], frame, lighting, 0.5);
    expect(f.pages.setView).toHaveBeenCalledOnce();
    frame.renderCamera.matrixWorldInverse.makeTranslation(1, 0, 0);
    f.adapter.update([], frame, lighting, 0.5);
    expect(f.pages.setView).toHaveBeenCalledTimes(2);
    expect(f.pages.clearCache).not.toHaveBeenCalled();
    f.adapter.invalidateContent();
    expect(f.pages.clearCache).toHaveBeenCalledOnce();
    f.adapter.invalidateContent([]);
    expect(f.pages.clearCache).toHaveBeenCalledOnce();
    expect(f.pages.invalidateCasters).not.toHaveBeenCalled();
    const changedBounds = new THREE.Box3(
      new THREE.Vector3(0, 1, 2),
      new THREE.Vector3(4, 5, 6)
    );
    f.adapter.invalidateContent([changedBounds]);
    expect(f.pages.invalidateCasters).toHaveBeenCalledOnce();
    expect(f.pages.invalidateCasters).toHaveBeenCalledWith(changedBounds);
    expect(f.pages.clearCache).toHaveBeenCalledOnce();
    f.adapter.dispose();
    expect(f.pages.dispose).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "mounts an idle lease only during the depth pass and restores it on failure=%s",
    async (fail) => {
      const f = fixture();
      const group = new THREE.Group();
      const lease = {
        covered: true,
        group,
        isCurrent: () => true,
        dispose: vi.fn(),
      };
      const signal = new AbortController().signal;
      const yieldToInput = vi.fn(async () => {
        expect(group.parent).toBeNull();
        expect(f.light.visible).toBe(true);
      });
      f.pages.prewarmNext.mockImplementation(() => {
        expect(group.parent).toBe(f.scene);
        expect(f.light.visible).toBe(false);
        if (fail) throw new Error("gpu unavailable");
        return {
          pageId: "64:1:0",
          rendered: 1,
          cachedSamples: 1,
          totalSamples: 1,
          complete: true,
          budgetLimited: false,
          aborted: false,
        };
      });
      const work = f.adapter.prewarm({
        cells: [],
        frame: {
          renderCamera: new THREE.Camera(),
          viewport: new THREE.Vector2(800, 600),
        } as SharedThreeSceneFrame,
        lighting: {
          directionToSun: new THREE.Vector3(0, 1, 0),
          color: "white",
          intensity: 1,
          shadowIntensity: 1,
        },
        targetPixels: 1,
        samples: 1,
        signal,
        prepare: async () => lease,
        yieldToInput,
      });
      if (fail) await expect(work).rejects.toThrow("gpu unavailable");
      else expect((await work)?.completed).toBe(1);
      expect(group.parent).toBeNull();
      expect(f.light.visible).toBe(true);
      expect(f.pages.clearPrewarmView).toHaveBeenCalledOnce();
      expect(lease.dispose).toHaveBeenCalledOnce();
      expect(f.pages.renderSample).not.toHaveBeenCalled();
      expect(f.renderer.render).not.toHaveBeenCalled();
    }
  );
});
