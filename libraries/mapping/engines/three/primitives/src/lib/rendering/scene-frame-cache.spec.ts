import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { SceneFrameCache } from "./scene-frame-cache";

const fixture = (maximumBytes?: number) => {
  const host = new THREE.WebGLRenderTarget(128, 96);
  let target: THREE.WebGLRenderTarget | null = host;
  let face = 2,
    mip = 1,
    scissorTest = true;
  const viewport = new THREE.Vector4(2, 3, 124, 90);
  const scissor = new THREE.Vector4(4, 5, 100, 80);
  const clear = new THREE.Color("red");
  let alpha = 0.5;
  const renderer = {
    capabilities: { maxTextureSize: 8192 },
    extensions: { has: vi.fn(() => true) },
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1,
    autoClear: true,
    initRenderTarget: vi.fn(),
    getRenderTarget: () => target,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    setRenderTarget: (
      next: THREE.WebGLRenderTarget | null,
      nextFace = 0,
      nextMip = 0
    ) => {
      target = next;
      face = nextFace;
      mip = nextMip;
    },
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    setViewport: (value: THREE.Vector4) => viewport.copy(value),
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    setScissor: (value: THREE.Vector4) => scissor.copy(value),
    getScissorTest: () => scissorTest,
    setScissorTest: (value: boolean) => {
      scissorTest = value;
    },
    getClearColor: (out: THREE.Color) => out.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (color: THREE.ColorRepresentation, nextAlpha: number) => {
      clear.set(color);
      alpha = nextAlpha;
    },
    clear: vi.fn(),
    render: vi.fn((_scene: THREE.Scene, _camera: THREE.Camera) => undefined),
  };
  const cache = new SceneFrameCache(
    renderer as unknown as THREE.WebGLRenderer,
    maximumBytes
  );
  return { cache, renderer, host };
};

describe("volatile native-pixel scene frame cache", () => {
  it("replays identical frames without scene work and invalidates registration changes", () => {
    const { cache, renderer } = fixture();
    const draw = vi.fn();
    cache.render("view-a", 128, 96, draw);
    cache.render("view-a", 128, 96, draw);
    expect(draw).toHaveBeenCalledOnce();
    expect(cache.stats).toMatchObject({
      captures: 1,
      reuses: 1,
      bytes: 128 * 96 * 20,
    });
    cache.render("view-b", 128, 96, draw);
    renderer.toneMappingExposure = 2;
    cache.render("view-b", 128, 96, draw);
    cache.render("view-b", 256, 192, draw);
    expect(draw).toHaveBeenCalledTimes(4);
    cache.dispose();
    expect(cache.stats.bytes).toBe(0);
  });

  it("captures native HDR/depth without an opaque clear and restores host state", () => {
    const { cache, renderer, host } = fixture();
    cache.render("native", 128, 96, () => {
      const target = renderer.getRenderTarget()!;
      expect(target.width).toBe(128);
      expect(target.height).toBe(96);
      expect(target.texture.type).toBe(THREE.FloatType);
      expect(target.depthTexture?.type).toBe(THREE.UnsignedIntType);
      expect(renderer.getClearAlpha()).toBe(0);
      expect(renderer.getScissorTest()).toBe(false);
    });
    expect(renderer.getRenderTarget()).toBe(host);
    expect(renderer.getActiveCubeFace()).toBe(2);
    expect(renderer.getActiveMipmapLevel()).toBe(1);
    expect(renderer.getViewport(new THREE.Vector4()).toArray()).toEqual([
      2, 3, 124, 90,
    ]);
    expect(renderer.getScissor(new THREE.Vector4()).toArray()).toEqual([
      4, 5, 100, 80,
    ]);
    expect(renderer.getScissorTest()).toBe(true);
    expect(renderer.getClearAlpha()).toBe(0.5);
    expect(renderer.autoClear).toBe(true);
    const scene = renderer.render.mock.calls[0][0] as THREE.Scene;
    const material = (scene.children[0] as THREE.Mesh)
      .material as THREE.ShaderMaterial;
    expect(material.fragmentShader).toContain("if (value.a == 0.0) discard");
    expect(material.fragmentShader).toContain(
      "mix(gl_DepthRange.near, gl_DepthRange.far"
    );
    cache.dispose();
  });

  it("falls back directly when native pixels exceed budget instead of shrinking", () => {
    const { cache, renderer, host } = fixture(128 * 96 * 20 - 1);
    const draw = vi.fn(() => expect(renderer.getRenderTarget()).toBe(host));
    expect(cache.render("large", 128, 96, draw)).toBe(false);
    expect(draw).toHaveBeenCalledOnce();
    expect(renderer.initRenderTarget).not.toHaveBeenCalled();
    expect(cache.stats.bytes).toBe(0);
  });

  it("restores after draw failure and never reuses the failed image", () => {
    const { cache, renderer, host } = fixture();
    expect(() =>
      cache.render("failed", 128, 96, () => {
        throw new Error("draw failed");
      })
    ).toThrow("draw failed");
    expect(renderer.getRenderTarget()).toBe(host);
    const draw = vi.fn();
    cache.render("failed", 128, 96, draw);
    expect(draw).toHaveBeenCalledOnce();
    cache.dispose();
  });

  it("falls back on unsupported or failed float allocation", () => {
    const { cache, renderer, host } = fixture();
    renderer.initRenderTarget.mockImplementationOnce(() => {
      throw new Error("allocation");
    });
    const draw = vi.fn(() => expect(renderer.getRenderTarget()).toBe(host));
    expect(cache.render("failure", 128, 96, draw)).toBe(false);
    expect(cache.render("failure", 128, 96, draw)).toBe(false);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(cache.stats).toMatchObject({ broken: true, bytes: 0 });
    const unsupported = fixture();
    unsupported.renderer.extensions.has.mockReturnValue(false);
    expect(unsupported.cache.render("unsupported", 128, 96, draw)).toBe(false);
  });
});
