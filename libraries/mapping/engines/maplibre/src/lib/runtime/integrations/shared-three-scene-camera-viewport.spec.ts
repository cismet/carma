// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharedThreeSceneLayer } from "../../core/shared-three-scene-types";
import { createSharedThreeSceneCameraPreview } from "./shared-three-scene-camera-preview";

const fixture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1200;
  const element = document.createElement("canvas");
  document.body.append(canvas, element);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 50, 800, 600)
  );
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(50, 100, 300, 200)
  );
  const gl = {
    FRAMEBUFFER: 1,
    FRAMEBUFFER_BINDING: 2,
    DEPTH_RANGE: 3,
    getParameter: (key: number) => (key === 3 ? [0, 0.985] : "host"),
    bindFramebuffer: vi.fn(),
    depthRange: vi.fn(),
  };
  const planes: THREE.Plane[] = [];
  const renderer = {
    domElement: canvas,
    getPixelRatio: () => 2,
    getContext: () => gl,
    clippingPlanes: planes,
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    getViewport: (v: THREE.Vector4) => v.set(1, 2, 3, 4),
    getScissor: (v: THREE.Vector4) => v.set(5, 6, 7, 8),
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    getScissorTest: () => false,
    setScissorTest: vi.fn(),
    getClearColor: (v: THREE.Color) => v.set(0x123456),
    getClearAlpha: () => 0.5,
    setClearColor: vi.fn(),
    resetState: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixelsAsync: vi.fn(),
  };
  let pass: (() => void) | null = null;
  const remove = vi.fn(() => {
    pass = null;
  });
  const scene = new THREE.Scene();
  const layer = {
    getRenderer: () => renderer,
    getScene: () => scene,
    addScreenRenderPass: vi.fn((draw: () => void) => {
      pass = draw;
      return remove;
    }),
    requestScreenRender: vi.fn(),
  } as unknown as SharedThreeSceneLayer;
  return {
    canvas,
    element,
    renderer,
    layer,
    gl,
    scene,
    remove,
    draw: () => pass?.(),
  };
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared canvas camera regions", () => {
  it("clips at the canvas edge without squeezing projection, applies DPR once, and restores state", () => {
    const f = fixture();
    const preview = createSharedThreeSceneCameraPreview(f.layer);
    const camera = new THREE.PerspectiveCamera();
    const projection = camera.projectionMatrix.clone();
    expect(preview.renderViewport(camera, f.element)).toBe(true);
    expect(f.renderer.setViewport).toHaveBeenNthCalledWith(
      1,
      -50,
      350,
      300,
      200
    );
    expect(f.renderer.setScissor).toHaveBeenNthCalledWith(1, 0, 350, 250, 200);
    expect(f.renderer.setScissorTest).toHaveBeenLastCalledWith(false);
    expect(f.renderer.autoClear).toBe(true);
    expect(f.gl.bindFramebuffer).toHaveBeenLastCalledWith(1, "host");
    expect(f.gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
    expect(f.renderer.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
    f.renderer.render.mockImplementation(() => {
      throw new Error("draw failed");
    });
    expect(() => preview.renderViewport(camera, f.element)).toThrow(
      "draw failed"
    );
    expect(f.renderer.setScissorTest).toHaveBeenLastCalledWith(false);
    expect(f.renderer.autoClear).toBe(true);
    preview.dispose();
  });

  it("registers one post-map pass, skips invisible regions and releases it", async () => {
    const f = fixture();
    const preview = createSharedThreeSceneCameraPreview(f.layer);
    const camera = new THREE.PerspectiveCamera();
    await preview.present(camera, f.element, 600, 400);
    await preview.present(camera, f.element, 600, 400);
    expect(f.layer.addScreenRenderPass).toHaveBeenCalledOnce();
    expect(f.renderer.render).not.toHaveBeenCalled();
    f.draw();
    expect(f.renderer.render).toHaveBeenCalledOnce();
    f.element.remove();
    f.draw();
    expect(f.renderer.render).toHaveBeenCalledOnce();
    preview.dispose();
    f.draw();
    expect(f.remove).toHaveBeenCalledOnce();
  });

  it("keeps detached readback pending until display presentation and never blits after disposal", async () => {
    const f = fixture();
    const preview = createSharedThreeSceneCameraPreview(f.layer);
    const popup = document.implementation
      .createHTMLDocument("popup")
      .createElement("canvas");
    const putImageData = vi.fn();
    vi.spyOn(popup, "getContext").mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {}
      }
    );
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      frames.push(cb)
    );
    const read = vi
      .spyOn(preview, "renderAsync")
      .mockImplementation(async (_cam, w, h, receive) => {
        receive(new Uint8Array(w * h * 4), w, h);
        return true;
      });
    const camera = new THREE.PerspectiveCamera();
    const first = preview.present(camera, popup, 2, 2);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(putImageData).not.toHaveBeenCalled();
    expect(await preview.present(camera, popup, 2, 2)).toBe(false);
    frames.shift()!(0);
    await first;
    expect(putImageData).toHaveBeenCalledOnce();
    const last = preview.present(camera, popup, 2, 2);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    preview.dispose();
    frames.shift()!(16);
    await last;
    expect(putImageData).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
