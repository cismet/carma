import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createSharedThreeSceneCameraPreview } from "./shared-three-scene-camera-preview";
import type { SharedThreeSceneLayer } from "../../core/shared-three-scene-types";

describe("shared Three.js camera preview", () => {
  it("renders offscreen and restores the shared renderer state", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    const hostFramebuffer = {} as WebGLFramebuffer;
    const depthRange = new Float32Array([0, 0.985]);
    const viewport = new THREE.Vector4(4, 5, 640, 360);
    const scissor = new THREE.Vector4(8, 9, 620, 340);
    const clearColor = new THREE.Color(0x123456);
    let clearAlpha = 0.4;
    let renderTarget: THREE.WebGLRenderTarget | null = null;
    let scissorTest = true;
    const primaryClippingPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 2),
    ];
    const gl = {
      FRAMEBUFFER: 0x8d40,
      FRAMEBUFFER_BINDING: 0x8ca6,
      DEPTH_RANGE: 0x0b70,
      getParameter: vi.fn((parameter: number) =>
        parameter === 0x8ca6 ? hostFramebuffer : depthRange
      ),
      bindFramebuffer: vi.fn(),
      depthRange: vi.fn(),
    };
    const renderer = {
      capabilities: { maxTextureSize: 4096 },
      clippingPlanes: primaryClippingPlanes,
      getContext: vi.fn(() => gl),
      getRenderTarget: vi.fn(() => renderTarget),
      setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => {
        renderTarget = next;
      }),
      getViewport: vi.fn((target: THREE.Vector4) => target.copy(viewport)),
      setViewport: vi.fn((value: THREE.Vector4 | number, ...rest: number[]) => {
        if (value instanceof THREE.Vector4) viewport.copy(value);
        else viewport.set(value, rest[0], rest[1], rest[2]);
      }),
      getScissor: vi.fn((target: THREE.Vector4) => target.copy(scissor)),
      setScissor: vi.fn((value: THREE.Vector4 | number, ...rest: number[]) => {
        if (value instanceof THREE.Vector4) scissor.copy(value);
        else scissor.set(value, rest[0], rest[1], rest[2]);
      }),
      getScissorTest: vi.fn(() => scissorTest),
      setScissorTest: vi.fn((next: boolean) => {
        scissorTest = next;
      }),
      getClearColor: vi.fn((target: THREE.Color) => target.copy(clearColor)),
      getClearAlpha: vi.fn(() => clearAlpha),
      setClearColor: vi.fn(
        (next: THREE.ColorRepresentation, nextAlpha: number) => {
          clearColor.set(next);
          clearAlpha = nextAlpha;
        }
      ),
      resetState: vi.fn(),
      clear: vi.fn(),
      render: vi.fn(),
      readRenderTargetPixels: vi.fn(
        (
          _target: THREE.WebGLRenderTarget,
          _x: number,
          _y: number,
          _width: number,
          _height: number,
          pixels: Uint8Array
        ) => pixels.fill(17)
      ),
      readRenderTargetPixelsAsync: vi.fn(
        async (
          _target: THREE.WebGLRenderTarget,
          _x: number,
          _y: number,
          _width: number,
          _height: number,
          pixels: Uint8Array
        ) => pixels
      ),
    } as unknown as THREE.WebGLRenderer;
    const layer = {
      getRenderer: () => renderer,
      getScene: () => scene,
    } as unknown as SharedThreeSceneLayer;
    const preview = createSharedThreeSceneCameraPreview(layer);
    const onFrame = vi.fn();

    expect(preview.render(camera, 48, 24, onFrame)).toBe(true);

    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(onFrame).toHaveBeenCalledOnce();
    expect(onFrame.mock.calls[0][0]).toHaveLength(48 * 24 * 4);
    expect(onFrame.mock.calls[0][0][0]).toBe(17);
    expect(renderTarget).toBeNull();
    expect(viewport.toArray()).toEqual([4, 5, 640, 360]);
    expect(scissor.toArray()).toEqual([8, 9, 620, 340]);
    expect(scissorTest).toBe(true);
    expect(clearColor.getHex()).toBe(0x123456);
    expect(clearAlpha).toBe(0.4);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(
      gl.FRAMEBUFFER,
      hostFramebuffer
    );
    const restoredDepthRange = gl.depthRange.mock.lastCall;
    expect(restoredDepthRange?.[0]).toBe(0);
    expect(restoredDepthRange?.[1]).toBeCloseTo(0.985);

    const readCount = vi.mocked(renderer.readRenderTargetPixels).mock.calls
      .length;
    const texture = preview.renderTexture(
      camera,
      48,
      24,
      primaryClippingPlanes
    );
    expect(texture).toBeInstanceOf(THREE.Texture);
    expect(preview.renderTexture(camera, 48, 24)).toBe(texture);
    expect(renderer.readRenderTargetPixels).toHaveBeenCalledTimes(readCount);
    expect(renderer.clippingPlanes).toBe(primaryClippingPlanes);
    preview.dispose();
  });

  it("keeps one async readback pending and restores host state immediately", async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const hostFramebuffer = {} as WebGLFramebuffer;
    const hostPixelPackBuffer = {} as WebGLBuffer;
    const hostDepthRange = new Float32Array([0.1, 0.9]);
    const hostViewport = new THREE.Vector4(1, 2, 300, 200);
    const hostScissor = new THREE.Vector4(3, 4, 280, 180);
    const hostColor = new THREE.Color(0xabcdef);
    const hostClippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 1)];
    const previewClippingPlanes = [
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 2),
    ];
    let resolveReadback!: (pixels: THREE.TypedArray) => void;
    const pendingReadback = new Promise<THREE.TypedArray>((resolve) => {
      resolveReadback = resolve;
    });
    let renderTarget: THREE.WebGLRenderTarget | null = null;
    let viewport = hostViewport.clone();
    let scissor = hostScissor.clone();
    let scissorTest = true;
    let clearColor = hostColor.clone();
    let clearAlpha = 0.25;
    let clippingPlanes = hostClippingPlanes;
    const clippingPlanesDuringRender: THREE.Plane[][] = [];
    const gl = {
      FRAMEBUFFER: 0x8d40,
      FRAMEBUFFER_BINDING: 0x8ca6,
      PIXEL_PACK_BUFFER: 0x88eb,
      PIXEL_PACK_BUFFER_BINDING: 0x88ed,
      DEPTH_RANGE: 0x0b70,
      getParameter: vi.fn((parameter: number) =>
        parameter === 0x8ca6
          ? hostFramebuffer
          : parameter === 0x88ed
          ? hostPixelPackBuffer
          : hostDepthRange
      ),
      bindFramebuffer: vi.fn(),
      bindBuffer: vi.fn(),
      depthRange: vi.fn(),
    };
    const renderer = {
      capabilities: { maxTextureSize: 1024 },
      get clippingPlanes() {
        return clippingPlanes;
      },
      set clippingPlanes(next: THREE.Plane[]) {
        clippingPlanes = next;
      },
      getContext: vi.fn(() => gl),
      getRenderTarget: vi.fn(() => renderTarget),
      setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => {
        renderTarget = next;
      }),
      getViewport: vi.fn((value: THREE.Vector4) => value.copy(viewport)),
      setViewport: vi.fn((value: THREE.Vector4 | number, ...rest: number[]) => {
        viewport =
          value instanceof THREE.Vector4
            ? value.clone()
            : new THREE.Vector4(value, rest[0], rest[1], rest[2]);
      }),
      getScissor: vi.fn((value: THREE.Vector4) => value.copy(scissor)),
      setScissor: vi.fn((value: THREE.Vector4 | number, ...rest: number[]) => {
        scissor =
          value instanceof THREE.Vector4
            ? value.clone()
            : new THREE.Vector4(value, rest[0], rest[1], rest[2]);
      }),
      getScissorTest: vi.fn(() => scissorTest),
      setScissorTest: vi.fn((next: boolean) => {
        scissorTest = next;
      }),
      getClearColor: vi.fn((value: THREE.Color) => value.copy(clearColor)),
      getClearAlpha: vi.fn(() => clearAlpha),
      setClearColor: vi.fn(
        (next: THREE.ColorRepresentation, nextAlpha: number) => {
          clearColor = new THREE.Color(next);
          clearAlpha = nextAlpha;
        }
      ),
      resetState: vi.fn(),
      clear: vi.fn(),
      render: vi.fn(() => clippingPlanesDuringRender.push([...clippingPlanes])),
      readRenderTargetPixels: vi.fn(),
      readRenderTargetPixelsAsync: vi.fn(() => pendingReadback),
    } as unknown as THREE.WebGLRenderer;
    const preview = createSharedThreeSceneCameraPreview({
      getRenderer: () => renderer,
      getScene: () => scene,
    } as unknown as SharedThreeSceneLayer);
    const onFrame = vi.fn();

    const result = preview.renderAsync(
      camera,
      32,
      16,
      onFrame,
      previewClippingPlanes
    );

    expect(renderer.clippingPlanes).toBe(hostClippingPlanes);
    expect(clippingPlanesDuringRender).toEqual([previewClippingPlanes]);
    expect(renderTarget).toBeNull();
    expect(viewport).toEqual(hostViewport);
    expect(scissor).toEqual(hostScissor);
    expect(scissorTest).toBe(true);
    expect(clearColor).toEqual(hostColor);
    expect(clearAlpha).toBe(0.25);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(
      gl.FRAMEBUFFER,
      hostFramebuffer
    );
    expect(gl.bindBuffer).toHaveBeenLastCalledWith(
      gl.PIXEL_PACK_BUFFER,
      hostPixelPackBuffer
    );
    await expect(preview.renderAsync(camera, 8, 8, onFrame)).resolves.toBe(
      false
    );
    expect(preview.render(camera, 8, 8, onFrame)).toBe(false);

    const pixels = new Uint8Array(32 * 16 * 4).fill(23);
    resolveReadback(pixels);
    await expect(result).resolves.toBe(true);
    expect(onFrame).toHaveBeenCalledOnce();
  });

  it("releases the async slot after rejection", async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const error = new Error("readback failed");
    const gl = {
      FRAMEBUFFER: 1,
      FRAMEBUFFER_BINDING: 2,
      PIXEL_PACK_BUFFER: 4,
      PIXEL_PACK_BUFFER_BINDING: 5,
      DEPTH_RANGE: 3,
      getParameter: vi.fn((parameter: number) =>
        parameter === 2 || parameter === 5 ? null : new Float32Array([0, 1])
      ),
      bindFramebuffer: vi.fn(),
      bindBuffer: vi.fn(),
      depthRange: vi.fn(),
    };
    const renderer = createMinimalRenderer(gl);
    vi.mocked(renderer.readRenderTargetPixelsAsync)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(new Uint8Array(4));
    const preview = createSharedThreeSceneCameraPreview({
      getRenderer: () => renderer,
      getScene: () => scene,
    } as unknown as SharedThreeSceneLayer);

    await expect(preview.renderAsync(camera, 1, 1, vi.fn())).rejects.toBe(
      error
    );
    await expect(preview.renderAsync(camera, 1, 1, vi.fn())).resolves.toBe(
      true
    );
  });

  it("defers disposal and suppresses an outstanding callback", async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    let resolveReadback!: (pixels: THREE.TypedArray) => void;
    const pending = new Promise<THREE.TypedArray>((resolve) => {
      resolveReadback = resolve;
    });
    const gl = {
      FRAMEBUFFER: 1,
      FRAMEBUFFER_BINDING: 2,
      PIXEL_PACK_BUFFER: 4,
      PIXEL_PACK_BUFFER_BINDING: 5,
      DEPTH_RANGE: 3,
      getParameter: vi.fn((parameter: number) =>
        parameter === 2 || parameter === 5 ? null : new Float32Array([0, 1])
      ),
      bindFramebuffer: vi.fn(),
      bindBuffer: vi.fn(),
      depthRange: vi.fn(),
    };
    const renderer = createMinimalRenderer(gl);
    vi.mocked(renderer.readRenderTargetPixelsAsync).mockReturnValue(pending);
    let activeTarget: THREE.WebGLRenderTarget | null = null;
    vi.mocked(renderer.setRenderTarget).mockImplementation((next) => {
      if (next) activeTarget = next;
    });
    const preview = createSharedThreeSceneCameraPreview({
      getRenderer: () => renderer,
      getScene: () => scene,
    } as unknown as SharedThreeSceneLayer);
    const onFrame = vi.fn();
    const result = preview.renderAsync(camera, 2, 2, onFrame);
    const dispose = vi.spyOn(activeTarget!, "dispose");

    preview.dispose();
    expect(dispose).not.toHaveBeenCalled();
    resolveReadback(new Uint8Array(16));
    await expect(result).resolves.toBe(true);
    expect(onFrame).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    await expect(preview.renderAsync(camera, 2, 2, onFrame)).resolves.toBe(
      false
    );
  });

  it("rejects invalid or oversized dimensions without rendering", async () => {
    const gl = {};
    const renderer = createMinimalRenderer(gl);
    Object.assign(renderer.capabilities, { maxTextureSize: 64 });
    const preview = createSharedThreeSceneCameraPreview({
      getRenderer: () => renderer,
      getScene: () => new THREE.Scene(),
    } as unknown as SharedThreeSceneLayer);
    const camera = new THREE.PerspectiveCamera();

    expect(preview.render(camera, Number.NaN, 1, vi.fn())).toBe(false);
    await expect(preview.renderAsync(camera, 65, 1, vi.fn())).resolves.toBe(
      false
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });
});

const createMinimalRenderer = (gl: object) =>
  ({
    capabilities: { maxTextureSize: 4096 },
    clippingPlanes: [],
    getContext: vi.fn(() => gl),
    getRenderTarget: vi.fn(() => null),
    setRenderTarget: vi.fn(),
    getViewport: vi.fn((value: THREE.Vector4) => value.set(0, 0, 1, 1)),
    setViewport: vi.fn(),
    getScissor: vi.fn((value: THREE.Vector4) => value.set(0, 0, 1, 1)),
    setScissor: vi.fn(),
    getScissorTest: vi.fn(() => false),
    setScissorTest: vi.fn(),
    getClearColor: vi.fn((value: THREE.Color) => value.set(0)),
    getClearAlpha: vi.fn(() => 1),
    setClearColor: vi.fn(),
    resetState: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixels: vi.fn(),
    readRenderTargetPixelsAsync: vi.fn(),
  } as unknown as THREE.WebGLRenderer);
