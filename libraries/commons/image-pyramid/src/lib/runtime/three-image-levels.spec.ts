import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import type { ImageLevelStack } from "./image-level-stack";
import type { ImageRect } from "../core/image-level-plan";
import { ThreeImageLevels } from "./three-image-levels";

const setup = (nested: boolean) => {
  const oldTarget = nested ? new THREE.WebGLRenderTarget(8, 8) : null;
  let target = oldTarget;
  const framebuffer = {} as WebGLFramebuffer;
  const gl = {
    FRAMEBUFFER: 1,
    FRAMEBUFFER_BINDING: 2,
    DEPTH_RANGE: 3,
    getParameter: vi.fn((key: number) =>
      key === 2 ? framebuffer : [0.1, 0.9]
    ),
    bindFramebuffer: vi.fn(),
    depthRange: vi.fn(),
  };
  const renderer = {
    capabilities: { maxTextureSize: 4096 },
    autoClear: true,
    getContext: () => gl,
    getRenderTarget: () => target,
    resetState: vi.fn(() => {
      target = null;
    }),
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => {
      target = value;
    }),
    getViewport: (v: THREE.Vector4) => v.set(1, 2, 300, 200),
    getScissor: (v: THREE.Vector4) => v.set(3, 4, 200, 100),
    getScissorTest: () => true,
    getClearColor: (c: THREE.Color) => c.setRGB(0.1, 0.2, 0.3),
    getClearAlpha: () => 0.4,
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  };
  const composer = new ThreeImageLevels();
  composer.attach({
    plan: { layers: [] },
    pyramid: { native: { width: 64, height: 64 }, levels: [] },
    onContentChange: () => () => {},
    onEvict: () => () => {},
  } as unknown as ImageLevelStack);
  const draw = (explicit: boolean) =>
    composer.renderToTarget(
      renderer as unknown as THREE.WebGLRenderer,
      { x: 0, y: 0, width: 64, height: 64 } as ImageRect,
      { width: 64, height: 64 },
      explicit ? { framebuffer, depthRange: [0.1, 0.9] } : undefined
    );
  return {
    renderer,
    gl,
    draw,
    oldTarget,
    framebuffer,
    dispose: () => {
      composer.dispose();
      oldTarget?.dispose();
    },
  };
};
describe("image composer explicit host state", () => {
  it.each([false, true])(
    "restores host or nested target without blocking queries, nested=%s",
    (nested) => {
      const f = setup(nested);
      try {
        f.draw(true);
        expect(f.gl.getParameter).not.toHaveBeenCalled();
        expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
        expect(f.gl.depthRange).toHaveBeenLastCalledWith(
          ...(nested ? [0, 1] : [0.1, 0.9])
        );
        if (nested) expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
        else
          expect(f.gl.bindFramebuffer).toHaveBeenLastCalledWith(
            1,
            f.framebuffer
          );
        expect(f.renderer.autoClear).toBe(true);
      } finally {
        f.dispose();
      }
    }
  );
  it("preserves standalone fallback and restores target after drawing fails", () => {
    const f = setup(false);
    try {
      f.renderer.clear.mockImplementationOnce(() => {
        throw Error("draw failed");
      });
      expect(() => f.draw(false)).toThrow("draw failed");
      expect(f.gl.getParameter.mock.calls).toEqual([[2], [3]]);
      expect(f.renderer.getRenderTarget()).toBe(null);
      expect(f.gl.bindFramebuffer).toHaveBeenLastCalledWith(1, f.framebuffer);
      expect(f.gl.depthRange).toHaveBeenLastCalledWith(0.1, 0.9);
    } finally {
      f.dispose();
    }
  });
});

it("restores the explicit host through Three's public framebuffer cache", () => {
  const f = setup(false);
  const bindFramebuffer = vi.fn();
  Object.assign(f.renderer, { state: { bindFramebuffer } });
  try {
    f.draw(true);
    expect(bindFramebuffer).toHaveBeenLastCalledWith(
      f.gl.FRAMEBUFFER,
      f.framebuffer
    );
    expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
    expect(f.gl.getParameter).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});
