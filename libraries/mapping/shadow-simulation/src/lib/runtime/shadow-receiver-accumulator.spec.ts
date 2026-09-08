import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShadowCorridorFrame } from "./shadow-corridor-accumulator";
import type { ShadowAccumulationPage } from "./tiled-shadow-renderer";

const state = vi.hoisted(() => ({
  scratchConstructions: 0,
  resets: 0,
  publications: [] as { id: string; key: string; samples: number }[],
  scratchKeys: [] as string[],
  restorePending: false,
  publicationBlocked: new Set<string>(),
  capturedSizes: new Map<
    string,
    { width: number; height: number; samples: number }
  >(),
}));

vi.mock("./shadow-corridor-presentation", () => ({
  SHADOW_CORRIDOR_RETAINED_BUDGET_BYTES: 256 * 1024 ** 2,
  ShadowCorridorPresentation: class {
    memoryBytes = 0;
    supportsCapture = true;
    beginFrame() {}
    prepareRestore() {}
    getCapturedSize(id: string) {
      return state.capturedSizes.get(id) ?? null;
    }
    canReplay(page: ShadowAccumulationPage) {
      return state.capturedSizes.has(page.id);
    }
    isRestorePending() {
      return state.restorePending;
    }
    has(page: ShadowAccumulationPage, samples: number) {
      return state.publications.some(
        (entry) =>
          entry.id === page.id &&
          entry.key === page.contentKey &&
          entry.samples === samples
      );
    }
    hasAtLeast(page: ShadowAccumulationPage, samples: number) {
      return state.publications.some(
        (entry) =>
          entry.id === page.id &&
          entry.key === page.contentKey &&
          entry.samples >= samples
      );
    }
    publish(
      _color: unknown,
      _reference: unknown,
      _camera: unknown,
      page: ShadowAccumulationPage,
      samples: number
    ) {
      if (state.publicationBlocked.has(page.id)) return false;
      const [, width, height] = JSON.parse(page.captureKey!);
      const bytes = [...state.capturedSizes].reduce(
        (sum, [id, size]) =>
          sum + (id === page.id ? 0 : size.width * size.height * 8),
        width * height * 8
      );
      if (bytes > 256 * 1024 ** 2) return false;
      state.capturedSizes.set(page.id, { width, height, samples });
      state.publications.push({ id: page.id, key: page.contentKey!, samples });
      return true;
    }
    dispose() {}
  },
}));

vi.mock("./shadow-corridor-accumulator", () => ({
  SHADOW_CORRIDOR_WORKING_BUDGET_BYTES: 512 * 1024 ** 2,
  ShadowCorridorAccumulator: class {
    memoryBytes = 0;
    fallbackReason = null;
    key = "";
    count = 0;
    pageProgress: { id: string; samples: number }[] = [];
    constructor(
      _renderer: unknown,
      private presentation: { publish: (...args: unknown[]) => boolean }
    ) {
      state.scratchConstructions += 1;
    }
    render(
      camera: THREE.Camera,
      pages: {
        accumulationPages: ShadowAccumulationPage[];
        renderSample: (
          camera: THREE.Camera,
          sample: number,
          samples: number
        ) => void;
        renderPageSample: (
          camera: THREE.Camera,
          id: string,
          sample: number,
          samples: number
        ) => void;
      },
      frame: ShadowCorridorFrame
    ) {
      const page = pages.accumulationPages[0];
      const key = JSON.stringify([
        page.id,
        page.revision,
        frame.viewKey,
        frame.samples,
      ]);
      if (this.key !== key) {
        this.key = key;
        this.count = 0;
      }
      state.scratchKeys.push(key);
      if (this.count < frame.samples) {
        if (this.count === 0) pages.renderSample(camera, 0, frame.samples);
        else pages.renderPageSample(camera, page.id, this.count, frame.samples);
        this.count += 1;
      }
      this.pageProgress = [{ id: page.id, samples: this.count }];
      const complete = this.count >= frame.samples;
      const settled =
        complete &&
        this.presentation.publish(null, null, camera, page, frame.samples);
      if (complete && !settled)
        return {
          progress: 0.99,
          settled: false,
          needsRepaint: false,
          retryAfterMs: 250,
        };
      return {
        progress: this.count / frame.samples,
        settled,
        needsRepaint: !settled,
      };
    }
    releaseScratch() {
      state.resets += 1;
      this.key = "";
      this.count = 0;
      this.pageProgress = [];
    }
    dispose() {}
  },
}));

import { ShadowReceiverAccumulator } from "./shadow-receiver-accumulator";

const fixture = () => {
  const observer = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
  observer.rotation.x = -0.6;
  observer.updateMatrixWorld(true);
  let target: THREE.WebGLRenderTarget | null = null;
  const viewport = new THREE.Vector4(0, 0, 1440, 1440);
  const scissor = viewport.clone();
  const color = new THREE.Color(1, 1, 1);
  let alpha = 1;
  let scissorTest = false;
  const renderer = {
    capabilities: { maxTextureSize: 4096 },
    extensions: { has: vi.fn(() => true) },
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => {
      target = next;
    },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    setViewport: (next: THREE.Vector4) => viewport.copy(next),
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    setScissor: (next: THREE.Vector4) => scissor.copy(next),
    getScissorTest: () => scissorTest,
    setScissorTest: (next: boolean) => {
      scissorTest = next;
    },
    getClearColor: (out: THREE.Color) => out.copy(color),
    getClearAlpha: () => alpha,
    setClearColor: (next: THREE.ColorRepresentation, nextAlpha: number) => {
      color.set(next);
      alpha = nextAlpha;
    },
    initRenderTarget: vi.fn(),
    clear: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const accumulator = new ShadowReceiverAccumulator(renderer);
  const page = (id: string): ShadowAccumulationPage => ({
    id,
    revision: "geometry",
    contentKey: "geometry",
    presentationKey: "sun",
    receiverBounds: new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 10, 10)
    ),
    screenBounds: new THREE.Vector4(0.8, 0.7, 0.2, 0.3),
    groundTexelTargetMeters: 0.2,
  });
  const pages = {
    accumulationPages: [page("a")],
    supportsOpaqueAccumulation: true,
    renderPageSample: vi.fn(() => true),
  };
  const frame: ShadowCorridorFrame = {
    width: 1440,
    height: 1440,
    viewKey: "live-view",
    styleEpoch: 0,
    samples: 3,
    active: true,
    options: { format: "rgba32f", msaaSamples: 0 },
  };
  return { accumulator, observer, pages, frame, page, renderer };
};

beforeEach(() => {
  state.scratchConstructions = 0;
  state.resets = 0;
  state.publications = [];
  state.scratchKeys = [];
  state.restorePending = false;
  state.publicationBlocked.clear();
  state.capturedSizes.clear();
});

describe("independent full-receiver accumulation", () => {
  it("admits all nine large pages by shrinking old pinned captures before adding the ninth", () => {
    const f = fixture();
    f.pages.accumulationPages = Array.from({ length: 8 }, (_, i) => ({
      ...f.page(String(i)),
      groundTexelTargetMeters: 0.001,
    }));
    const frame = {
      ...f.frame,
      width: 2048,
      height: 2048,
      maxRenderTargetPixels: 2048 ** 2,
    };
    for (let i = 0; i < 8; i++)
      expect(
        f.accumulator.renderHard(f.observer, f.pages, frame).published
      ).toBe(1);
    expect(
      [...state.capturedSizes.values()].reduce(
        (sum, p) => sum + p.width * p.height * 8,
        0
      )
    ).toBe(256 * 1024 ** 2);
    f.pages.accumulationPages.push({
      ...f.page("8"),
      groundTexelTargetMeters: 0.001,
    });
    const start = state.publications.length;
    for (let i = 0; i < 3; i++)
      expect(
        f.accumulator.renderHard(f.observer, f.pages, frame).published
      ).toBe(1);
    expect(state.publications.slice(start).map(({ id }) => id)).toEqual([
      "0",
      "1",
      "8",
    ]);
    expect(state.capturedSizes.size).toBe(9);
    expect(
      [...state.capturedSizes.values()].reduce(
        (sum, p) => sum + p.width * p.height * 8,
        0
      )
    ).toBe(256 * 1024 ** 2);
    for (let i = 0; i < 9; i++)
      f.accumulator.render(f.observer, f.pages, { ...frame, samples: 1 });
    expect(f.accumulator.pageProgress.every((page) => page.published)).toBe(
      true
    );
    expect(
      f.accumulator.pageProgress.filter(
        (page) => page.width < 2048 || page.height < 2048
      )
    ).toHaveLength(2);
  });

  it("does not replace a useful soft capture with a resized hard capture without byte pressure", () => {
    const f = fixture();
    for (let i = 0; i < 3; i++)
      f.accumulator.render(f.observer, f.pages, f.frame);
    const old = { ...state.capturedSizes.get("a")! };
    f.pages.accumulationPages[0] = {
      ...f.pages.accumulationPages[0],
      groundTexelTargetMeters: 1,
    };
    expect(
      f.accumulator.renderHard(f.observer, f.pages, f.frame).published
    ).toBe(0);
    expect(state.capturedSizes.get("a")).toEqual(old);
    expect(state.publications).toHaveLength(1);
  });

  it("retains completed scratch for transient retries but yields after repeated publication failures", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const f = fixture();
      f.pages.accumulationPages.push(f.page("b"));
      state.publicationBlocked.add("a");
      f.accumulator.render(f.observer, f.pages, f.frame);
      f.accumulator.render(f.observer, f.pages, f.frame);
      const first = f.accumulator.render(f.observer, f.pages, f.frame);
      expect(first).toMatchObject({ needsRepaint: false, retryAfterMs: 250 });
      const resets = state.resets;
      const rendered = f.pages.renderPageSample.mock.calls.length;
      clock.mockReturnValue(100);
      expect(f.accumulator.render(f.observer, f.pages, f.frame)).toMatchObject({
        retryAfterMs: 150,
      });
      expect(state.resets).toBe(resets);
      expect(f.pages.renderPageSample).toHaveBeenCalledTimes(rendered);
      clock.mockReturnValue(250);
      f.accumulator.render(f.observer, f.pages, f.frame);
      expect(state.resets).toBe(resets);
      expect(f.pages.renderPageSample).toHaveBeenCalledTimes(rendered);
      clock.mockReturnValue(500);
      expect(f.accumulator.render(f.observer, f.pages, f.frame)).toMatchObject({
        needsRepaint: true,
      });
      expect(state.resets).toBe(resets + 1);
      for (let i = 0; i < 3; i++)
        f.accumulator.render(f.observer, f.pages, f.frame);
      expect(state.publications.map(({ id }) => id)).toEqual(["b"]);
      const waiting = f.accumulator.render(f.observer, f.pages, f.frame);
      expect(waiting).toMatchObject({
        needsRepaint: false,
        retryAfterMs: 1000,
      });
      state.publicationBlocked.delete("a");
      clock.mockReturnValue(1500);
      for (let i = 0; i < 3; i++)
        f.accumulator.render(f.observer, f.pages, f.frame);
      expect(state.publications.map(({ id }) => id)).toEqual(["b", "a"]);
    } finally {
      clock.mockRestore();
    }
  });

  it("publishes after a transient copy failure without recomputing the completed samples", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const f = fixture();
      state.publicationBlocked.add("a");
      for (let i = 0; i < 3; i++)
        f.accumulator.render(f.observer, f.pages, f.frame);
      expect(f.pages.renderPageSample).toHaveBeenCalledTimes(3);
      state.publicationBlocked.delete("a");
      clock.mockReturnValue(250);
      expect(f.accumulator.render(f.observer, f.pages, f.frame)?.settled).toBe(
        true
      );
      expect(f.pages.renderPageSample).toHaveBeenCalledTimes(3);
      expect(state.publications).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });

  it("keeps unsupported material pages for direct rendering without capturing their albedo", () => {
    const f = fixture();
    f.pages.supportsOpaqueAccumulation = false;
    const result = f.accumulator.renderHard(f.observer, f.pages, f.frame);
    expect(result).toEqual({ published: 0, needsRepaint: false });
    expect(f.accumulator.capturePages.map(({ id }) => id)).toEqual(["a"]);
    expect(f.renderer.initRenderTarget).not.toHaveBeenCalled();
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
    expect(state.publications).toHaveLength(0);
  });

  it("immediately exits unsupported numeric capture instead of retrying a whole sun disc", () => {
    const f = fixture();
    Object.defineProperty(f.accumulator.presentation, "supportsCapture", {
      value: false,
      configurable: true,
    });
    for (let frame = 0; frame < 3; frame += 1) {
      expect(f.accumulator.renderHard(f.observer, f.pages, f.frame)).toEqual({
        published: 0,
        needsRepaint: false,
      });
      expect(f.accumulator.render(f.observer, f.pages, f.frame)).toBeNull();
    }
    expect(f.accumulator.fallbackReason).toBe("receivers");
    expect(f.renderer.initRenderTarget).not.toHaveBeenCalled();
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
    expect(state.publications).toHaveLength(0);
    expect(f.accumulator.capturePages.map(({ id }) => id)).toEqual(["a"]);
    Object.defineProperty(f.accumulator.presentation, "supportsCapture", {
      value: true,
      configurable: true,
    });
    expect(f.accumulator.render(f.observer, f.pages, f.frame)).not.toBeNull();
    expect(f.pages.renderPageSample).toHaveBeenCalledOnce();
  });

  it("does not schedule hard-capture retries when float render targets are unsupported", () => {
    const f = fixture();
    vi.mocked(f.renderer.extensions.has).mockReturnValue(false);
    for (let i = 0; i < 3; i++) {
      expect(f.accumulator.renderHard(f.observer, f.pages, f.frame)).toEqual({
        published: 0,
        needsRepaint: false,
      });
    }
    expect(f.renderer.initRenderTarget).not.toHaveBeenCalled();
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
    expect(state.publications).toHaveLength(0);
  });

  it("keeps active sample progress when translating and when another page arrives", () => {
    const f = fixture();
    f.accumulator.render(f.observer, f.pages, f.frame);
    f.observer.position.x += 10;
    f.observer.updateMatrixWorld(true);
    f.pages.accumulationPages.push(f.page("b"));
    f.accumulator.render(f.observer, f.pages, { ...f.frame, viewKey: "moved" });
    f.accumulator.render(f.observer, f.pages, {
      ...f.frame,
      viewKey: "moved-again",
    });
    expect(state.scratchKeys[1]).toBe(state.scratchKeys[0]);
    expect(state.publications.map(({ id }) => id)).toEqual(["a"]);
    expect(state.scratchConstructions).toBe(1);
    expect(
      f.accumulator.pageProgress.find(({ id }) => id === "b")?.samples
    ).toBe(0);
  });

  it("renders each initial sample only for its complete capture page, never the observer crop", () => {
    const f = fixture();
    f.accumulator.render(f.observer, f.pages, f.frame);
    const call = f.pages.renderPageSample.mock.calls[0] as unknown as [
      THREE.Camera,
      string,
      number,
      number,
      THREE.Vector4
    ];
    expect(call[0]).toBeInstanceOf(THREE.OrthographicCamera);
    expect(call.slice(1, 4)).toEqual(["a", 0, 3]);
    expect(call[4]).toEqual(new THREE.Vector4(0, 0, 1, 1));
  });

  it("does not render even the first soft sample for an unready corridor", () => {
    const f = fixture();
    const result = f.accumulator.render(f.observer, f.pages, {
      ...f.frame,
      isPageReady: () => false,
    });
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
    expect(result?.settled).toBe(false);
    expect(result?.needsRepaint).toBe(false);
  });

  it("accepts more than 64 receiver descriptors without a global atlas fallback", () => {
    const f = fixture();
    f.pages.accumulationPages = Array.from({ length: 70 }, (_, index) =>
      f.page(String(index))
    );
    const result = f.accumulator.render(f.observer, f.pages, {
      ...f.frame,
      samples: 1,
    });
    expect(result).not.toBeNull();
    expect(f.accumulator.pageProgress).toHaveLength(70);
    expect(state.publications).toHaveLength(1);
    expect(f.pages.renderPageSample).toHaveBeenCalledOnce();
  });

  it("does not claim a changed capture direction is already complete", () => {
    const f = fixture();
    f.accumulator.render(f.observer, f.pages, { ...f.frame, samples: 1 });
    const original = f.accumulator.capturePages[0].captureKey;
    f.observer.rotation.y += 0.2;
    f.observer.updateMatrixWorld(true);
    f.accumulator.render(f.observer, f.pages, f.frame);
    expect(f.accumulator.capturePages[0].captureKey).not.toBe(original);
    expect(f.accumulator.pageProgress[0].published).toBe(false);
  });

  it("publishes a hard-ready stage without resetting an unrelated active soft page", () => {
    const f = fixture();
    f.accumulator.render(f.observer, f.pages, f.frame);
    const resets = state.resets;
    f.pages.accumulationPages = [f.page("b")];
    const hard = f.accumulator.renderHard(f.observer, f.pages, {
      ...f.frame,
      isPageReady: () => true,
    });
    expect(hard.published).toBe(1);
    expect(state.publications.at(-1)).toMatchObject({ id: "b", samples: 1 });
    expect(state.resets).toBe(resets);
    f.pages.accumulationPages = [f.page("a"), f.page("b")];
    f.accumulator.render(f.observer, f.pages, f.frame);
    expect(state.scratchKeys[1]).toBe(state.scratchKeys[0]);
    expect(
      f.accumulator.pageProgress.find(({ id }) => id === "a")?.samples
    ).toBe(2);
  });

  it("never downgrades a matching soft publication to one hard sample", () => {
    const f = fixture();
    for (let i = 0; i < 3; i += 1)
      f.accumulator.render(f.observer, f.pages, f.frame);
    const calls = f.pages.renderPageSample.mock.calls.length;
    expect(
      f.accumulator.renderHard(f.observer, f.pages, f.frame).published
    ).toBe(0);
    expect(f.pages.renderPageSample).toHaveBeenCalledTimes(calls);
    expect(state.publications).toHaveLength(1);
    expect(state.publications[0].samples).toBe(3);
  });

  it("offers a pending persistent restore one frame without waiting for its storage timeout", () => {
    const f = fixture();
    state.restorePending = true;
    expect(
      f.accumulator.render(f.observer, f.pages, f.frame)?.needsRepaint
    ).toBe(true);
    expect(f.pages.renderPageSample).not.toHaveBeenCalled();
    f.accumulator.render(f.observer, f.pages, f.frame);
    expect(f.pages.renderPageSample).toHaveBeenCalledOnce();
  });

  it("separates committed hard readiness from final soft readiness while paused", () => {
    const f = fixture();
    f.pages.accumulationPages = [{ ...f.page("a"), ready: false }];
    expect(
      f.accumulator.renderHard(f.observer, f.pages, {
        ...f.frame,
        isPageReady: () => true,
      }).published
    ).toBe(1);
    f.accumulator.render(f.observer, f.pages, {
      ...f.frame,
      active: false,
      isPageReady: () => false,
    });
    expect(f.accumulator.pageProgress[0]).toMatchObject({
      ready: false,
      published: false,
      totalSamples: 3,
    });
    expect(state.publications).toHaveLength(1);
    expect(state.publications[0].samples).toBe(1);
  });
});
