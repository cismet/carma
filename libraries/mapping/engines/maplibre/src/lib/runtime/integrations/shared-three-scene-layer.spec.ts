import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  buildSharedThreeSceneLayer,
  installRenderTargetDepthRangeBridge,
  syncSharedCanvasViewport,
} from "./shared-three-scene-layer";

describe("shared Three.js scene layer", () => {
  it("tracks MapLibre canvas resizes in Three's main framebuffer viewport", () => {
    const renderer = {
      setViewport: vi.fn(),
    } as unknown as Pick<THREE.WebGLRenderer, "setViewport">;
    const canvas = { width: 1_280, height: 720 };
    const viewport = new THREE.Vector2(1, 1);

    syncSharedCanvasViewport(renderer, canvas, viewport);

    expect(viewport.toArray()).toEqual([1_280, 720]);
    expect(renderer.setViewport).toHaveBeenLastCalledWith(0, 0, 1_280, 720);

    canvas.width = 1_400;
    canvas.height = 500;
    syncSharedCanvasViewport(renderer, canvas, viewport);

    expect(viewport.toArray()).toEqual([1_400, 500]);
    expect(renderer.setViewport).toHaveBeenLastCalledWith(0, 0, 1_400, 500);

    syncSharedCanvasViewport(renderer, canvas, viewport);
    expect(renderer.setViewport).toHaveBeenCalledTimes(2);
  });

  it("uses canonical depth for offscreen targets and MapLibre depth on main", () => {
    const events: string[] = [];
    const originalSetRenderTarget = vi.fn((target: unknown) => {
      events.push(target === null ? "target:main" : "target:offscreen");
    });
    const renderer = {
      setRenderTarget: originalSetRenderTarget,
    } as unknown as Pick<THREE.WebGLRenderer, "setRenderTarget">;
    const gl = {
      depthRange: vi.fn((near: number, far: number) => {
        events.push(`depth:${near}:${far}`);
      }),
    };
    const bridge = installRenderTargetDepthRangeBridge(renderer, gl);

    bridge.render([0, 0.985], () => {
      renderer.setRenderTarget({} as THREE.WebGLRenderTarget);
      renderer.setRenderTarget(null);
    });

    expect(events).toEqual([
      "target:offscreen",
      "depth:0:1",
      "target:main",
      "depth:0:0.985",
      "depth:0:0.985",
    ]);

    bridge.dispose();
    renderer.setRenderTarget(null);
    expect(originalSetRenderTarget).toHaveBeenCalledTimes(3);
    expect(gl.depthRange).toHaveBeenCalledTimes(3);
  });

  it("exposes attached runtime roots", () => {
    const layer = buildSharedThreeSceneLayer("shared-three-scene");
    const root = new THREE.Group();
    const dispose = vi.fn();

    layer.addRuntime({
      id: "mesh-runtime",
      originLngLat: [7.15, 51.25],
      root,
      update: vi.fn(),
      dispose,
    });

    expect(layer.getScene().children).toContain(root);
    expect(layer.hasRuntime("mesh-runtime")).toBe(true);

    layer.removeRuntime("mesh-runtime");

    expect(layer.getScene().children).not.toContain(root);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
