import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";

import { ShadowTiledScene } from "./shadow-tiled-scene";
import { TiledShadowRenderer } from "./tiled-shadow-renderer";
import { ShadowReceiverAccumulator } from "./shadow-receiver-accumulator";
import { SceneFrameCache } from "@carma-mapping/engines/three/primitives/rendering";

vi.mock("@carma-mapping/engines/three/primitives/rendering", () => ({
  SceneFrameCache: vi.fn(),
}));

vi.mock("./tiled-shadow-renderer", () => ({ TiledShadowRenderer: vi.fn() }));
vi.mock("./shadow-receiver-accumulator", () => ({
  ShadowReceiverAccumulator: vi.fn(),
}));
vi.mock("./shadow-corridor-cache-client", () => ({
  createShadowCorridorCache: () => ({ dispose: vi.fn() }),
}));

describe("Geoportal tiled scene adapter", () => {
  const fixture = (
    host: {
      isCorridorReady?: (bounds: THREE.Box3, error?: number) => boolean;
      receiverStageError?: (bounds: THREE.Box3) => number;
      visualEpoch?: () => number;
      onPresentedPages?: (pages: readonly { id: string }[]) => void;
    } = {}
  ) => {
    let frameKey: string | null = null;
    const frameCache = {
      render: vi.fn(
        (key: string, _width: number, _height: number, draw: () => void) => {
          if (key !== frameKey) {
            draw();
            frameKey = key;
          }
          return true;
        }
      ),
      invalidate: vi.fn(() => {
        frameKey = null;
      }),
      dispose: vi.fn(),
      stats: {},
    };
    vi.mocked(SceneFrameCache).mockImplementation(() => frameCache as never);
    const pages = {
      setView: vi.fn(),
      renderSample: vi.fn(),
      renderPageSample: vi.fn(() => true),
      getPageGeometry: vi.fn(() => ({
        casterBounds: new THREE.Box3(),
        receiverBounds: new THREE.Box3(),
        width: 64,
        height: 64,
      })),
      accumulationPages: [
        {
          id: "64:1:0",
          revision: "initial",
          receiverBounds: new THREE.Box3(),
          screenBounds: new THREE.Vector4(),
        },
      ],
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
      renderHard: vi.fn(() => ({ published: 0, needsRepaint: false })),
      capturePages: pages.accumulationPages,
      dispose: vi.fn(),
      pageProgress: [{ id: "64:1:0", samples: 5, totalSamples: 16 }],
      memoryBytes: 1024,
      fallbackReason: null,
      presentation: {
        revision: 0,
        supportsCapture: true,
        beginFrame: vi.fn(),
        canReplay: vi.fn(() => false),
        hasAtLeast: vi.fn(() => false),
        render: vi.fn((_scene, _page, _samples, draw) => draw()),
        capture: vi.fn((_scene, draw) => draw()),
        stats: {},
      },
    };
    vi.mocked(ShadowReceiverAccumulator).mockImplementation(
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
      ...host,
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
      frameCache,
    };
  };

  it("budgets a retained maximum-size depth page in addition to streamed scratch", () => {
    const f = fixture();
    expect(TiledShadowRenderer).toHaveBeenLastCalledWith(
      f.scene,
      f.renderer,
      2 * 2048 ** 2 * 8,
      2048
    );
  });

  it("keeps corridor integration running but memoizes unchanged native-pixel presentation", () => {
    let visualEpoch = 0;
    const f = fixture({ visualEpoch: () => visualEpoch });
    f.accumulation.render.mockReturnValue({
      progress: 0.2,
      settled: false,
      needsRepaint: true,
    });
    f.accumulation.presentation.canReplay.mockReturnValue(true);
    const camera = new THREE.Camera();
    const frame = {
      width: 2560,
      height: 1440,
      viewKey: "view",
      styleEpoch: 1,
      samples: 512,
      active: true,
    };
    f.adapter.renderProgressive(camera, frame);
    f.adapter.renderProgressive(camera, frame);
    expect(f.accumulation.render).toHaveBeenCalledTimes(2);
    expect(f.pages.renderPageSample).toHaveBeenCalledOnce();
    expect(f.frameCache.render).toHaveBeenLastCalledWith(
      expect.any(String),
      2560,
      1440,
      expect.any(Function)
    );
    f.accumulation.presentation.revision += 1;
    f.adapter.renderProgressive(camera, frame);
    f.adapter.renderProgressive(camera, { ...frame, styleEpoch: 2 });
    camera.matrixWorldInverse.makeTranslation(1, 0, 0);
    f.adapter.renderProgressive(camera, { ...frame, styleEpoch: 2 });
    expect(f.pages.renderPageSample).toHaveBeenCalledTimes(4);
    f.accumulation.capturePages[0].revision = "geometry-changed";
    f.adapter.renderProgressive(camera, { ...frame, styleEpoch: 2 });
    expect(f.pages.renderPageSample).toHaveBeenCalledTimes(5);
    f.adapter.invalidateContent();
    f.adapter.renderProgressive(camera, { ...frame, styleEpoch: 2 });
    expect(f.pages.renderPageSample).toHaveBeenCalledTimes(6);
    f.accumulation.presentation.supportsCapture = false;
    f.adapter.renderProgressive(camera, frame);
    f.adapter.renderProgressive(camera, frame);
    expect(f.pages.renderPageSample).toHaveBeenCalledTimes(8);
    f.accumulation.presentation.supportsCapture = true;
    f.adapter.renderProgressive(camera, frame);
    const beforeVisualChange = f.pages.renderPageSample.mock.calls.length;
    visualEpoch += 1;
    f.adapter.renderProgressive(camera, frame);
    expect(f.pages.renderPageSample).toHaveBeenCalledTimes(
      beforeVisualChange + 1
    );
  });

  it("rebuilds the frame when direct readiness changes instead of caching an empty hole", () => {
    const ready = vi.fn(() => false);
    const f = fixture({ isCorridorReady: ready });
    f.accumulation.render.mockReturnValue({
      progress: 0,
      settled: false,
      needsRepaint: true,
    });
    const frame = {
      width: 100,
      height: 100,
      viewKey: "view",
      styleEpoch: 0,
      samples: 512,
      active: true,
    };
    const camera = new THREE.Camera();
    f.adapter.renderProgressive(camera, frame);
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
    ready.mockReturnValue(true);
    f.adapter.renderProgressive(camera, frame);
    expect(f.pages.renderPageSample).toHaveBeenCalledOnce();
  });

  it("acknowledges current captures and successful direct hard draws, not compatible old captures", () => {
    const onPresentedPages = vi.fn();
    const f = fixture({ onPresentedPages });
    const camera = new THREE.Camera();
    f.adapter.render(camera, null, 512);
    expect(onPresentedPages).toHaveBeenLastCalledWith(
      f.accumulation.capturePages,
      f.accumulation.capturePages
    );
    onPresentedPages.mockClear();
    f.accumulation.presentation.canReplay.mockReturnValue(true);
    f.adapter.render(camera, null, 512);
    expect(onPresentedPages).not.toHaveBeenCalled();
    f.accumulation.presentation.hasAtLeast.mockReturnValue(true);
    f.adapter.render(camera, null, 512);
    expect(onPresentedPages).toHaveBeenCalledOnce();
    onPresentedPages.mockClear();
    f.pages.renderPageSample.mockReturnValue(false);
    f.adapter.render(camera, null, 512);
    expect(onPresentedPages).not.toHaveBeenCalled();
  });

  it("does not acknowledge a frame whose presentation throws", () => {
    const onPresentedPages = vi.fn();
    const f = fixture({ onPresentedPages });
    f.pages.renderPageSample.mockImplementation(() => {
      throw new Error("draw failed");
    });
    expect(() => f.adapter.render(new THREE.Camera(), null, 512)).toThrow(
      "draw failed"
    );
    expect(onPresentedPages).not.toHaveBeenCalled();
  });

  it("never draws a receiver whose current-stage offscreen caster cut is incomplete", () => {
    const ready = vi.fn(() => false);
    const f = fixture({ isCorridorReady: ready, receiverStageError: () => 16 });
    f.adapter.render(new THREE.Camera(), null, 128);
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
    const hardFrame = f.accumulation.renderHard.mock.calls[0][2];
    expect(hardFrame.isPageReady("64:1:0")).toBe(false);
    ready.mockReturnValue(true);
    f.adapter.render(new THREE.Camera(), null, 128);
    expect(f.pages.renderPageSample).toHaveBeenCalledWith(
      expect.any(THREE.Camera),
      "64:1:0",
      0,
      1
    );
    expect(ready).toHaveBeenLastCalledWith(
      expect.any(THREE.Box3),
      16,
      expect.any(THREE.Box3)
    );
  });

  it("gates final sun-disc readiness separately from committed coarse hard stages", () => {
    const f = fixture({
      isCorridorReady: (_bounds, error) => error === 16,
      receiverStageError: () => 16,
    });
    f.accumulation.render.mockReturnValue({
      progress: 0,
      settled: false,
      needsRepaint: false,
    });
    f.adapter.renderProgressive(new THREE.Camera(), {
      width: 1200,
      height: 900,
      viewKey: "view",
      styleEpoch: 0,
      samples: 128,
      active: true,
    });
    expect(
      f.accumulation.renderHard.mock.calls[0][2].isPageReady("64:1:0")
    ).toBe(true);
    expect(f.accumulation.render.mock.calls[0][2].isPageReady("64:1:0")).toBe(
      false
    );
    expect(f.pages.renderPageSample).toHaveBeenCalledOnce();
  });

  it("keeps a completed compatible shadow visible while replacement casters are loading", () => {
    const f = fixture({ isCorridorReady: () => false });
    f.accumulation.presentation.canReplay.mockReturnValue(true);
    f.adapter.render(new THREE.Camera(), null, 128);
    expect(f.accumulation.presentation.render).toHaveBeenCalledOnce();
    expect(f.pages.renderPageSample).toHaveBeenCalledOnce();
    expect(
      f.accumulation.renderHard.mock.calls[0][2].isPageReady("64:1:0")
    ).toBe(false);
    f.accumulation.presentation.canReplay.mockReturnValue(false);
    f.pages.renderPageSample.mockClear();
    f.adapter.render(new THREE.Camera(), null, 128);
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
  });

  it("does not declare an empty initial committed cut settled or request an empty render loop", () => {
    const f = fixture();
    f.accumulation.capturePages = [];
    f.accumulation.render.mockReturnValue({
      progress: 1,
      settled: true,
      needsRepaint: true,
    });
    expect(
      f.adapter.renderProgressive(new THREE.Camera(), {
        width: 800,
        height: 600,
        viewKey: "bootstrap",
        styleEpoch: 0,
        samples: 128,
        active: true,
      })
    ).toEqual({ progress: 0, settled: false, needsRepaint: false });
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
  });

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
    expect(f.pages.renderPageSample).toHaveBeenCalledWith(
      camera,
      "64:1:0",
      5,
      128
    );
    expect(f.renderer.render).toHaveBeenCalledTimes(2);
    expect(f.scene.children.every((c) => c.visible)).toBe(true);
    expect(f.renderer.autoClear).toBe(true);
    f.pages.renderPageSample.mockImplementationOnce(() => {
      throw new Error("shader");
    });
    expect(() => f.adapter.render(camera, null, 128)).toThrow("shader");
    expect(f.pages.renderPageSample).toHaveBeenLastCalledWith(
      camera,
      "64:1:0",
      0,
      1
    );
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
