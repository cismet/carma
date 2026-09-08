import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  ShadowCorridorAccumulator,
  type ShadowCorridorFrame,
} from "./shadow-corridor-accumulator";
import type { ShadowAccumulationPage } from "./tiled-shadow-renderer";

const fixture = () => {
  const hostTarget = new THREE.WebGLRenderTarget(320, 200);
  let target: THREE.WebGLRenderTarget | null = hostTarget;
  let cubeFace = 2;
  let mipmapLevel = 1;
  let clearAlpha = 0.5;
  let scissorTest = true;
  const clearColor = new THREE.Color("red");
  const viewport = new THREE.Vector4(2, 3, 300, 190);
  const scissor = new THREE.Vector4(4, 5, 290, 180);
  const passes: {
    material: THREE.ShaderMaterial;
    refresh: boolean;
    resetAll: boolean;
    weight: number;
    bounds: number;
  }[] = [];
  const renderer = {
    initRenderTarget: vi.fn(),
    copyTextureToTexture: vi.fn(),
    capabilities: { maxTextureSize: 8192 },
    autoClear: true,
    getRenderTarget: () => target,
    getActiveCubeFace: () => cubeFace,
    getActiveMipmapLevel: () => mipmapLevel,
    setRenderTarget: (
      next: THREE.WebGLRenderTarget | null,
      cube = 0,
      mipmap = 0
    ) => {
      target = next;
      cubeFace = cube;
      mipmapLevel = mipmap;
    },
    getClearColor: (out: THREE.Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (color: THREE.ColorRepresentation, alpha = 1) => {
      clearColor.set(color);
      clearAlpha = alpha;
    },
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    setViewport: (next: THREE.Vector4) => viewport.copy(next),
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    setScissor: (next: THREE.Vector4) => scissor.copy(next),
    getScissorTest: () => scissorTest,
    setScissorTest: (next: boolean) => {
      scissorTest = next;
    },
    clear: vi.fn(),
    render: vi.fn((scene: THREE.Scene) => {
      const material = (scene.children[0] as THREE.Mesh)
        .material as THREE.ShaderMaterial;
      passes.push({
        material,
        refresh: material.uniforms.uRefresh?.value,
        resetAll: material.uniforms.uResetAll?.value,
        weight: material.uniforms.uWeights?.value[0],
        bounds: material.uniforms.uBoundsCount?.value,
      });
    }),
  };
  const pages: ShadowAccumulationPage[] = [0, 1, 2].map((index) => ({
    id: String(index),
    revision: "initial",
    receiverBounds: new THREE.Box3(
      new THREE.Vector3(index * 10, 0, 0),
      new THREE.Vector3(index * 10 + 10, 10, 10)
    ),
    // The first two corridors overlap in screen space; the third is unrelated.
    screenBounds: new THREE.Vector4([0, 0.2, 0.7][index], 0, 0.3, 0.5),
  }));
  const pageRenderer = {
    accumulationPages: pages,
    supportsOpaqueAccumulation: true,
    renderSample: vi.fn(),
    renderPageSample: vi.fn(
      (_camera: THREE.Camera, _id: string, _sample: number, _samples: number) =>
        true
    ),
  };
  const camera = new THREE.PerspectiveCamera(60, 1.6, 1, 1000);
  const accumulator = new ShadowCorridorAccumulator(
    renderer as unknown as THREE.WebGLRenderer
  );
  const frame: ShadowCorridorFrame = {
    width: 320,
    height: 200,
    viewKey: "view",
    styleEpoch: 0,
    samples: 3,
    active: true,
    options: { format: "rgba32f", msaaSamples: 0 },
    maxPagesPerFrame: 1,
  };
  const render = (overrides: Partial<ShadowCorridorFrame> = {}) =>
    accumulator.render(camera, pageRenderer, { ...frame, ...overrides });
  const finish = () => {
    for (let index = 0; index < 7; index += 1) render();
  };
  return {
    accumulator,
    camera,
    frame,
    render,
    finish,
    pageRenderer,
    renderer,
    passes,
    hostTarget,
    pages,
  };
};

describe("camera-registered corridor accumulation", () => {
  it("batches sequential samples of one corridor with independent running-mean blends", () => {
    const f = fixture();
    f.pages.splice(1);
    const frame = {
      samples: 8,
      maxPagesPerFrame: 4,
      maxFrameCpuMilliseconds: 1000,
    };
    f.render(frame);
    f.passes.length = 0;
    f.render(frame);
    expect(
      f.pageRenderer.renderPageSample.mock.calls.map((call) => call[2])
    ).toEqual([1, 2, 3, 4]);
    expect(f.accumulator.pageProgress[0].samples).toBe(5);
    expect(
      f.passes.filter((pass) => pass.bounds === 1).map((pass) => pass.weight)
    ).toEqual(Array.from(new Float32Array([1 / 2, 1 / 3, 1 / 4, 1 / 5])));
    expect(f.render(frame)?.settled).toBe(true);
    expect(
      f.pageRenderer.renderPageSample.mock.calls.map((call) => call[2])
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("yields a single-corridor batch when its CPU budget expires", () => {
    const f = fixture();
    f.pages.splice(1);
    const frame = {
      samples: 8,
      maxPagesPerFrame: 4,
      maxFrameCpuMilliseconds: 4,
    };
    f.render(frame);
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    f.pageRenderer.renderPageSample.mockImplementation(() => {
      clock += 5;
      return true;
    });
    try {
      f.render(frame);
      expect(f.pageRenderer.renderPageSample).toHaveBeenCalledOnce();
      expect(f.accumulator.pageProgress[0].samples).toBe(2);
    } finally {
      now.mockRestore();
    }
  });

  it("releases working targets without evicting externally owned completed captures", () => {
    const f = fixture();
    f.finish();
    const presentation = f.accumulator.presentation;
    const dispose = vi.spyOn(presentation, "dispose");
    const shared = new ShadowCorridorAccumulator(
      f.renderer as unknown as THREE.WebGLRenderer,
      presentation
    );
    f.accumulator.releaseScratch();
    expect(f.accumulator.pageProgress).toEqual([]);
    expect(presentation.has(f.pages[0], f.frame.samples)).toBe(true);
    shared.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(presentation.has(f.pages[0], f.frame.samples)).toBe(true);
    f.accumulator.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not finish until every completed corridor capture was published, and retries without resampling", () => {
    const f = fixture();
    const original = f.accumulator.presentation.publish.bind(
      f.accumulator.presentation
    );
    let reject = true;
    vi.spyOn(f.accumulator.presentation, "publish").mockImplementation(
      (...args) => (args[3].id === "2" && reject ? false : original(...args))
    );
    f.finish();
    expect(f.render()).toMatchObject({
      settled: false,
      needsRepaint: false,
      retryAfterMs: expect.any(Number),
    });
    expect(f.render()!.progress).toBeLessThan(1);
    expect(f.accumulator.pageProgress.map((page) => page.published)).toEqual([
      true,
      true,
      false,
    ]);
    const submissions = f.pageRenderer.renderPageSample.mock.calls.length;
    reject = false;
    expect(f.render()).toEqual({
      progress: 1,
      settled: true,
      needsRepaint: false,
    });
    expect(f.pageRenderer.renderPageSample).toHaveBeenCalledTimes(submissions);
    expect(f.accumulator.pageProgress.every((page) => page.published)).toBe(
      true
    );
  });

  it("keeps an unready one-sample corridor pending even though its preview was rendered", () => {
    const f = fixture();
    for (let i = 0; i < 3; i++)
      f.render({ samples: 1, isPageReady: (id) => id !== "2" });
    expect(f.render({ samples: 1, isPageReady: (id) => id !== "2" })).toEqual({
      progress: 2 / 3,
      settled: false,
      needsRepaint: false,
    });
    expect(f.render({ samples: 1, isPageReady: () => true })).toEqual({
      progress: 1,
      settled: true,
      needsRepaint: false,
    });
  });

  it("retries a failed GPU copy without reporting successful publication", () => {
    const f = fixture();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = f.accumulator.presentation.publish.bind(
      f.accumulator.presentation
    );
    const publish = vi
      .spyOn(f.accumulator.presentation, "publish")
      .mockImplementation(() => {
        throw new Error("copy failed");
      });
    f.finish();
    expect(f.render()?.settled).toBe(false);
    expect(f.accumulator.pageProgress.every((page) => !page.published)).toBe(
      true
    );
    publish.mockImplementation(original);
    expect(f.render()?.settled).toBe(true);
    vi.mocked(console.error).mockRestore();
  });

  it("never publishes intermediate soft-shadow sample stages", () => {
    const f = fixture();
    const publish = vi.spyOn(f.accumulator.presentation, "publish");
    for (let i = 0; i < 100; i++) f.render({ samples: 128 });
    expect(f.accumulator.pageProgress.every((page) => page.samples < 128)).toBe(
      true
    );
    expect(publish).not.toHaveBeenCalled();
    for (let i = 0; i < 300; i++) f.render({ samples: 128 });
    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish.mock.calls.every((call) => call[4] === 128)).toBe(true);
  });
  it("publishes ready corridors while an unrelated corridor is still loading", () => {
    const f = fixture();
    const isPageReady = (id: string) => id !== "2";
    for (let i = 0; i < 8; i++) f.render({ isPageReady });
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      3, 3, 1,
    ]);
    expect(f.accumulator.presentation.has(f.pages[0], 3)).toBe(true);
    expect(f.accumulator.presentation.has(f.pages[1], 3)).toBe(true);
    expect(f.accumulator.presentation.has(f.pages[2], 3)).toBe(false);
    expect(f.render({ isPageReady })?.needsRepaint).toBe(false);
    f.render({ active: false });
    expect(f.accumulator.presentation.has(f.pages[0], 3)).toBe(true);
    f.render({ isPageReady: () => true });
    for (let i = 0; i < 8; i++) f.render({ isPageReady: () => true });
    expect(f.accumulator.presentation.has(f.pages[2], 3)).toBe(true);
  });
  it("fills every page with the same real first sample before independent round-robin refinement", () => {
    const f = fixture();
    expect(f.render()).toEqual({
      progress: 1 / 3,
      settled: false,
      needsRepaint: true,
    });
    expect(f.pageRenderer.renderSample).toHaveBeenCalledWith(f.camera, 0, 3);
    expect(f.pageRenderer.renderPageSample).not.toHaveBeenCalled();
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      1, 1, 1,
    ]);
    f.render();
    expect(f.pageRenderer.renderPageSample).toHaveBeenLastCalledWith(
      f.camera,
      "0",
      1,
      3
    );
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      2, 1, 1,
    ]);
    f.render();
    expect(f.pageRenderer.renderPageSample).toHaveBeenLastCalledWith(
      f.camera,
      "1",
      1,
      3
    );
    expect(
      f.passes
        .filter((pass) => !pass.refresh && pass.bounds)
        .map((pass) => pass.weight)
    ).toEqual([0.5, 0.5]);
  });

  it("stops sample submissions at convergence without scheduling a perpetual repaint", () => {
    const f = fixture();
    f.finish();
    expect(f.render()).toEqual({
      progress: 1,
      settled: true,
      needsRepaint: false,
    });
    expect(f.pageRenderer.renderSample).toHaveBeenCalledTimes(1);
    expect(f.pageRenderer.renderPageSample).toHaveBeenCalledTimes(6);
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      3, 3, 3,
    ]);
  });

  it("resets changed and screen-overlapping corridors, retaining the unrelated mean and count", () => {
    const f = fixture();
    f.finish();
    f.pages[0] = { ...f.pages[0], revision: "changed caster" };
    f.render();
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      1, 1, 3,
    ]);
    expect(f.pageRenderer.renderSample).toHaveBeenCalledTimes(2);
    expect(f.passes.filter((pass) => pass.refresh).at(-1)).toMatchObject({
      resetAll: false,
      bounds: 2,
    });
    expect(f.pageRenderer.renderPageSample).toHaveBeenCalledTimes(6);
  });

  it("keeps completed unrelated corridors when a new corridor arrives", () => {
    const f = fixture();
    f.finish();
    f.pages.push({
      ...f.pages[2],
      id: "new",
      screenBounds: new THREE.Vector4(0, 0.7, 0.3, 0.2),
      receiverBounds: new THREE.Box3(
        new THREE.Vector3(30, 0, 0),
        new THREE.Vector3(40, 10, 10)
      ),
    });
    f.render();
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      3, 3, 3, 1,
    ]);
    expect(f.passes.filter((pass) => pass.refresh).at(-1)).toMatchObject({
      resetAll: false,
      bounds: 1,
    });
  });

  it("refreshes disocclusion neighbours on removal without restarting unrelated corridors", () => {
    const f = fixture();
    f.finish();
    f.pages.splice(0, 1);
    f.render();
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      1, 3,
    ]);
    expect(f.passes.filter((pass) => pass.refresh).at(-1)).toMatchObject({
      resetAll: false,
      bounds: 1,
    });
  });

  it.each(["viewKey", "styleEpoch"] as const)(
    "never reuses camera-registered RGB after %s changes",
    (key) => {
      const f = fixture();
      f.finish();
      f.render({ [key]: "changed" });
      expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
        1, 1, 1,
      ]);
      expect(f.passes.filter((pass) => pass.refresh).at(-1)).toMatchObject({
        resetAll: true,
      });
    }
  );

  it("restarts the finite-disc sequence when sample count changes or after inactive preview", () => {
    const f = fixture();
    f.finish();
    expect(f.render({ active: false })).toBeNull();
    f.render({ samples: 5 });
    expect(f.pageRenderer.renderSample).toHaveBeenLastCalledWith(
      f.camera,
      0,
      5
    );
    expect(f.accumulator.pageProgress.map((page) => page.totalSamples)).toEqual(
      [5, 5, 5]
    );
  });

  it("rejects MSAA and translucent receiver ambiguity rather than claiming exact page ownership", () => {
    const f = fixture();
    expect(
      f.render({ options: { format: "rgba32f", msaaSamples: 4 } })
    ).toBeNull();
    expect(
      f.render({ options: { format: "r32f", msaaSamples: 0 } })
    ).toBeNull();
    f.pageRenderer.supportsOpaqueAccumulation = false;
    expect(f.render()).toBeNull();
    expect(f.pageRenderer.renderSample).not.toHaveBeenCalled();
    expect(f.accumulator.memoryBytes).toBe(0);
    expect(f.accumulator.fallbackReason).toBe("receivers");
  });

  it("admits native pixels or returns fallback without allocating reduced colour targets", () => {
    const f = fixture();
    expect(f.render({ maxRenderTargetPixels: 100 })).toBeNull();
    expect(f.accumulator.memoryBytes).toBe(0);
    expect(f.accumulator.fallbackReason).toBe("budget");
    expect(f.render({ maxRenderTargetPixels: Infinity })).not.toBeNull();
    expect(f.accumulator.memoryBytes).toBe(320 * 200 * 72);
    expect(f.render({ width: 8192, height: 8192 })).toBeNull();
    expect(f.accumulator.memoryBytes).toBe(0);
  });

  it("keeps scalar visibility work within budget as native-resolution captures arrive", () => {
    const f = fixture();
    vi.spyOn(f.accumulator.presentation, "memoryBytes", "get").mockReturnValue(
      240 * 1024 ** 2
    );
    const result = f.render({
      width: 2400,
      height: 2398,
      visibilityOnly: true,
    });
    expect(result).not.toBeNull();
    expect(f.accumulator.memoryBytes).toBe(2400 * 2398 * 24 + 240 * 1024 ** 2);
    expect(f.accumulator.fallbackReason).toBeNull();
    // Ordinary RGB rendering still accounts for its four-channel buffers.
    expect(
      f.render({ width: 2400, height: 2398, visibilityOnly: false })
    ).toBeNull();
    expect(f.accumulator.fallbackReason).toBe("budget");
  });

  it("does not restart scalar sunlight visibility when the live basemap style changes", () => {
    const f = fixture();
    f.render({ visibilityOnly: true });
    f.render({ visibilityOnly: true, styleEpoch: 1 });
    f.render({ visibilityOnly: true, styleEpoch: 2 });
    expect(f.pageRenderer.renderSample).toHaveBeenCalledTimes(1);
    expect(f.accumulator.pageProgress.some((page) => page.samples > 1)).toBe(
      true
    );
  });

  it("uses reference world position and matching nearest depth, not rectangle-only colour masks", () => {
    const f = fixture();
    f.render();
    const blend = f.passes[0].material;
    expect(blend.fragmentShader).toContain("uInverseViewProjection * vec4");
    expect(blend.fragmentShader).toContain("world.x >= bounds.x");
    expect(blend.fragmentShader).toContain("abs(sampleDepth - depth)");
    expect(
      blend.uniforms.uInverseViewProjection.value.equals(
        f.camera.projectionMatrix.clone().invert()
      )
    ).toBe(true);
    const composite = f.passes[1].material;
    expect(composite.fragmentShader).toContain(
      "gl_FragDepth = texture(tDepth, vUv).r"
    );
    expect(composite.fragmentShader).not.toContain("tUnshadowed");
  });

  it("batches independent page samples into one clear and one weighted atlas blend", () => {
    const f = fixture();
    f.render();
    f.renderer.clear.mockClear();
    f.passes.length = 0;
    f.render({ maxPagesPerFrame: 3, maxFrameCpuMilliseconds: 1000 });
    expect(f.pageRenderer.renderPageSample).toHaveBeenCalledTimes(3);
    expect(f.renderer.clear).toHaveBeenCalledTimes(1);
    expect(f.passes).toHaveLength(2);
    expect(f.passes[0]).toMatchObject({ bounds: 3, weight: 0.5 });
    expect(f.accumulator.pageProgress.map((page) => page.samples)).toEqual([
      2, 2, 2,
    ]);
  });

  it("makes progress with an exhausted submission budget without starting a second page", () => {
    const f = fixture();
    f.render();
    f.render({ maxPagesPerFrame: 4, maxFrameCpuMilliseconds: 0 });
    expect(f.pageRenderer.renderPageSample).toHaveBeenCalledTimes(1);
  });

  it("restores host framebuffer, viewport, scissor and clear state, including failed submissions", () => {
    const f = fixture();
    f.render();
    expect(f.renderer.getRenderTarget()).toBe(f.hostTarget);
    expect(f.renderer.getActiveCubeFace()).toBe(2);
    expect(f.renderer.getActiveMipmapLevel()).toBe(1);
    expect(f.renderer.getViewport(new THREE.Vector4()).toArray()).toEqual([
      2, 3, 300, 190,
    ]);
    expect(f.renderer.getScissor(new THREE.Vector4()).toArray()).toEqual([
      4, 5, 290, 180,
    ]);
    expect(f.renderer.getScissorTest()).toBe(true);
    expect(f.renderer.getClearColor(new THREE.Color()).getHexString()).toBe(
      "ff0000"
    );
    expect(f.renderer.getClearAlpha()).toBe(0.5);
    expect(f.renderer.autoClear).toBe(true);
    f.pageRenderer.renderPageSample.mockReturnValueOnce(false);
    expect(f.render()).toBeNull();
    expect(f.renderer.getRenderTarget()).toBe(f.hostTarget);
  });

  it("releases bounded target ownership and stops after disposal", () => {
    const f = fixture();
    f.render();
    expect(f.accumulator.memoryBytes).toBeGreaterThan(0);
    f.accumulator.dispose();
    f.accumulator.dispose();
    expect(f.accumulator.memoryBytes).toBe(0);
    expect(f.render()).toBeNull();
    expect(f.accumulator.pageProgress).toEqual([]);
  });
});
