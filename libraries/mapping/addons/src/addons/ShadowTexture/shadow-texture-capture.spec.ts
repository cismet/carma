import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Camera, EqualDepth, Group, Mesh } from "three";

import { createDzbPrmShadowCapture } from "./shadow-texture-capture";

const mocks = vi.hoisted(() => ({
  bufferWidth: 8192,
  bufferHeight: 8192,
  bufferHeightLimit: 8192,
  renderer: {
    shadowMap: {},
    capabilities: { maxTextureSize: 8192 },
    domElement: {},
    getContext: () => ({
      get drawingBufferWidth() {
        return mocks.bufferWidth;
      },
      get drawingBufferHeight() {
        return mocks.bufferHeight;
      },
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
    renderBufferDirect: vi.fn(),
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
    mocks.bufferHeightLimit = 8192;
    mocks.renderer.setSize.mockImplementation(
      (width: number, height: number) => {
        mocks.bufferWidth = width;
        mocks.bufferHeight = Math.min(height, mocks.bufferHeightLimit);
      }
    );
    mocks.load.mockImplementation(async ({ root }) => {
      root.add(new Mesh(new BoxGeometry(100, 50, 100)));
    });
  });

  it("keeps the same footprint and camera when the browser clamps an 8K buffer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const capture = createDzbPrmShadowCapture();
    const standard = await capture.render({
      ...options,
      pixelsPerMeter: 100,
      sunDiscSamples: 1,
    });
    const camera = mocks.renderer.render.mock.calls[0][1] as Camera;
    mocks.bufferHeightLimit = 4320;
    const fine = await capture.render({
      ...options,
      pixelsPerMeter: 100,
      maxImageDimension: 8192,
      sunDiscSamples: 1,
    });
    expect(fine!.canvas.width).toBe(4320);
    expect(fine!.canvas.height).toBe(4320);
    expect(fine!.resolutionLimited).toBe(true);
    expect(fine!.coordinates).toEqual(standard!.coordinates);
    const fineCamera = mocks.renderer.render.mock.lastCall![1] as Camera;
    expect(fineCamera.projectionMatrix.elements).toEqual(
      camera.projectionMatrix.elements
    );
    expect(fineCamera.matrixWorld.elements).toEqual(
      camera.matrixWorld.elements
    );
    expect(mocks.renderer.setSize).toHaveBeenLastCalledWith(4320, 4320, false);
    await expect(
      capture.render({
        ...options,
        outputSize: { width: 8192, height: 8192 },
        maxImageDimension: 8192,
        sunDiscSamples: 1,
        strictOutputSize: true,
      })
    ).rejects.toThrow("available GPU drawing buffer");
    capture.dispose();
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

  it.each(["bridge", "bridgeExisting"])(
    "adds the catalog caster while %s still casts and receives shadows",
    async (partId) => {
      const context = { drawImage: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        context as unknown as CanvasRenderingContext2D
      );
      const bridge = new Group();
      bridge.userData.dzbPrmGlbPartId = "catalogBridge";
      const deck = new Mesh(new BoxGeometry(60, 2, 5));
      deck.position.y = 30;
      bridge.add(deck);
      const printableBridge = new Mesh(new BoxGeometry(60, 5, 6));
      printableBridge.userData.dzbPrmGlbPartId = partId;
      const environment = new Mesh(new BoxGeometry(100, 20, 100));
      mocks.load.mockImplementation(async ({ root }) => {
        root.add(environment, printableBridge, bridge);
      });
      const passes: boolean[] = [];
      const lightCamera = new Camera();
      mocks.renderer.render.mockImplementation((scene, camera) => {
        passes.push(bridge.visible);
        expect(deck.castShadow).toBe(true);
        expect(deck.receiveShadow).toBe(false);
        expect(printableBridge.castShadow).toBe(true);
        expect(printableBridge.receiveShadow).toBe(true);
        expect(environment.castShadow).toBe(true);
        expect(environment.receiveShadow).toBe(true);
        if (passes.length === 2) {
          expect(scene.overrideMaterial.depthFunc).toBe(EqualDepth);
        }
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          if (passes.length === 2 && object.castShadow)
            mocks.renderer.renderBufferDirect(
              lightCamera,
              scene,
              object.geometry,
              object.material,
              object,
              null
            );
          mocks.renderer.renderBufferDirect(
            camera,
            scene,
            object.geometry,
            object.material,
            object,
            null
          );
        });
      });
      const capture = createDzbPrmShadowCapture();
      await capture.render({
        ...options,
        visibility: {
          ...options.visibility,
          bridge: partId === "bridge",
          bridgeExisting: partId === "bridgeExisting",
          catalogBridge: true,
        },
        sunDiscSamples: 1,
      });
      expect(passes).toEqual([true, true]);
      const draws = mocks.renderer.renderBufferDirect.mock.calls;
      expect(
        draws
          .filter(([camera]) => camera === lightCamera)
          .map((args) => args[4])
      ).toEqual([deck, environment, printableBridge]);
      expect(
        draws
          .filter(([camera]) => camera !== lightCamera)
          .map((args) => args[4])
      ).toEqual([environment, printableBridge, environment, printableBridge]);
      expect(context.drawImage).toHaveBeenCalledTimes(1);
      capture.dispose();
    }
  );
});
