import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, EqualDepth, Group, Mesh } from "three";

import { createDzbPrmShadowCapture } from "./shadow-texture-capture";

const mocks = vi.hoisted(() => ({
  renderer: {
    shadowMap: {},
    capabilities: { maxTextureSize: 8192 },
    domElement: {},
    getContext: () => ({
      MAX_VIEWPORT_DIMS: 1,
      MAX_RENDERBUFFER_SIZE: 2,
      getParameter: (key: number) =>
        key === 1 ? new Int32Array([8192, 8192]) : 8192,
    }),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    setSize: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  },
  load: vi.fn(),
}));
vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: class {
    constructor() {
      return mocks.renderer;
    }
  },
}));
vi.mock("./shadow-texture-assets", () => ({
  loadDzbPrmGlbPartsIntoRoot: mocks.load,
  disposeDzbPrmGlbRoot: vi.fn(),
}));

const options = {
  assetBaseUrl: "/assets/5m",
  visibility: {
    environment: true,
    zoo: false,
    bridge: false,
    bridgeExisting: false,
    station: false,
    catalogBridge: false,
  },
  sunAzimuthDegrees: 180,
  sunElevationDegrees: 30,
  pixelsPerMeter: 1,
  maxImageDimension: 4096 as const,
  sunDiscSamples: 64 as const,
  isCancelled: () => false,
};

describe("shadow capture masks", () => {
  beforeEach(() => {
    mocks.load.mockImplementation(async ({ root }) => {
      root.add(new Mesh(new BoxGeometry(100, 50, 100)));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("fills the night extent with an opaque black mask without shadow passes", async () => {
    const context = { fillRect: vi.fn(), fillStyle: "" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const capture = createDzbPrmShadowCapture();
    const image = await capture.render({ ...options, sunElevationDegrees: -5 });
    expect(context.fillStyle).toBe("#000000");
    expect(context.fillRect).toHaveBeenCalledWith(
      0,
      0,
      image!.canvas.width,
      image!.canvas.height
    );
    expect(image!.coordinates).toHaveLength(4);
    expect(mocks.renderer.render).not.toHaveBeenCalled();
    capture.dispose();
  });

  it("yields and cancels after one soft sample instead of completing eight", async () => {
    const context = { drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    let cancelled = false;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      cancelled = true;
      callback(0);
      return 1;
    });
    const opacity: number[] = [];
    mocks.renderer.render.mockImplementation((scene) => {
      opacity.push(scene.overrideMaterial.opacity);
    });
    const capture = createDzbPrmShadowCapture();
    const result = await capture.render({
      ...options,
      isCancelled: () => cancelled,
    });
    expect(result).toBeNull();
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(opacity).toEqual([1, 1]); // depth then full-strength shadow mask
    capture.dispose();
  });

  it("keeps the catalog bridge in receiver depth and shadow passes alongside Bestand", async () => {
    const context = { drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const bridge = new Group();
    bridge.userData.dzbPrmGlbPartId = "catalogBridge";
    const deck = new Mesh(new BoxGeometry(60, 2, 5));
    deck.position.y = 30;
    bridge.add(deck);
    mocks.load.mockImplementation(async ({ root }) => {
      root.add(new Mesh(new BoxGeometry(100, 20, 100)), bridge);
    });
    const passes: boolean[] = [];
    mocks.renderer.render.mockImplementation((scene) => {
      passes.push(bridge.visible);
      expect(deck.castShadow).toBe(true);
      expect(deck.receiveShadow).toBe(true);
      if (passes.length === 2) {
        expect(scene.overrideMaterial.depthFunc).toBe(EqualDepth);
      }
    });
    const capture = createDzbPrmShadowCapture();
    await capture.render({
      ...options,
      visibility: {
        ...options.visibility,
        bridgeExisting: true,
        catalogBridge: true,
      },
      sunDiscSamples: 1,
    });
    expect(passes).toEqual([true, true]);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    capture.dispose();
  });
});
