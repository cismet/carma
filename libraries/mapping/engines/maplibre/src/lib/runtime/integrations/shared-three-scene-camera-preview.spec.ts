import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createSharedThreeSceneCameraPreview } from "./shared-three-scene-camera-preview";
import type { SharedThreeSceneLayer } from "./shared-three-scene-layer";

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

    preview.dispose();
  });
});
