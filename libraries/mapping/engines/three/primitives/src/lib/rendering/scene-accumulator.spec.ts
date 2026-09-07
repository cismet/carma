import {
  FloatType,
  HalfFloatType,
  NearestFilter,
  RedFormat,
  Texture,
  UnsignedByteType,
  type Mesh,
  type ShaderMaterial,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { describe, expect, it, vi } from "vitest";

import {
  buildSharedSceneAccumulator,
  fitRenderTargetSizeToPixelBudget,
} from "./scene-accumulator";

const buildRenderer = (broken = false) => {
  let target: WebGLRenderTarget | null = null;
  const renderer = {
    getRenderTarget: vi.fn(() => target),
    setRenderTarget: vi.fn((next: WebGLRenderTarget | null) => {
      target = next;
    }),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixels: vi.fn(
      (
        readTarget: WebGLRenderTarget,
        _x: number,
        _y: number,
        _width: number,
        _height: number,
        pixels: Uint16Array
      ) => {
        if (readTarget.depthBuffer) pixels[3] = 0x3c00;
        else if (!broken) pixels[0] = 1;
      }
    ),
  };
  return renderer as unknown as WebGLRenderer;
};

describe("buildSharedSceneAccumulator", () => {
  it("composes scalar visibility with borrowed linear RGB caches without new rounds", () => {
    const renderer = buildRenderer();
    const accumulator = buildSharedSceneAccumulator(1, { format: "r32f" });
    accumulator.renderRound(renderer, 8, 8, () => undefined);
    const unshadowed = new Texture();
    const indirect = new Texture();
    const disposeUnshadowed = vi.spyOn(unshadowed, "dispose");
    const disposeIndirect = vi.spyOn(indirect, "dispose");
    expect(
      accumulator.composite(renderer, false, { unshadowed, indirect })
    ).toBe(true);
    const scene = vi.mocked(renderer.render).mock.calls.at(-1)?.[0];
    const material = (scene?.children[0] as Mesh).material as ShaderMaterial;
    expect(material.uniforms.uMonochrome.value).toBe(true);
    expect(material.uniforms.uLighting.value).toBe(true);
    expect(material.uniforms.tUnshadowed.value).toBe(unshadowed);
    expect(material.uniforms.tIndirect.value).toBe(indirect);
    expect(material.fragmentShader).toContain(
      "indirect.rgb + color.r * (unshadowed.rgb - indirect.rgb)"
    );
    expect(material.fragmentShader).toContain(
      "if (!uMonochrome || uLighting) color.rgb = toneMapping(color.rgb)"
    );
    expect(accumulator.nextRound).toBe(1);
    accumulator.composite(renderer);
    expect(material.uniforms.uLighting.value).toBe(false);
    expect(material.uniforms.tUnshadowed.value).toBeNull();
    expect(material.uniforms.tIndirect.value).toBeNull();
    accumulator.composite(renderer, false, { unshadowed, indirect });
    accumulator.dispose();
    expect(disposeUnshadowed).not.toHaveBeenCalled();
    expect(disposeIndirect).not.toHaveBeenCalled();
    expect(material.uniforms.tUnshadowed.value).toBeNull();
    expect(material.uniforms.tIndirect.value).toBeNull();
    unshadowed.dispose();
    indirect.dispose();
  });

  it("ignores RGB lighting caches when compositing an RGB accumulation", () => {
    const renderer = buildRenderer();
    const accumulator = buildSharedSceneAccumulator(1);
    accumulator.renderRound(renderer, 8, 8, () => undefined);
    const texture = new Texture();
    accumulator.composite(renderer, false, {
      unshadowed: texture,
      indirect: texture,
    });
    const scene = vi.mocked(renderer.render).mock.calls.at(-1)?.[0];
    const material = (scene?.children[0] as Mesh).material as ShaderMaterial;
    expect(material.uniforms.uMonochrome.value).toBe(false);
    expect(material.uniforms.uLighting.value).toBe(false);
    expect(material.uniforms.tUnshadowed.value).toBeNull();
    accumulator.dispose();
    texture.dispose();
  });

  it.each([
    ["rgba16f", HalfFloatType, Uint16Array, 4],
    ["rgba32f", FloatType, Float32Array, 0],
    ["rgba8", UnsignedByteType, Uint8Array, 4],
  ] as const)(
    "uses requested %s precision throughout the sample chain",
    (format, type, PixelArray, samples) => {
      const renderer = buildRenderer();
      const accumulator = buildSharedSceneAccumulator(2, {
        format,
        msaaSamples: 4,
      });
      accumulator.renderRound(renderer, 8, 8, () => undefined);
      const [scene, accumulation] = vi.mocked(renderer.readRenderTargetPixels)
        .mock.calls;
      expect(scene[0].texture.type).toBe(type);
      expect(accumulation[0].texture.type).toBe(type);
      expect(scene[5]).toBeInstanceOf(PixelArray);
      expect(scene[0].samples).toBe(samples);
      expect(accumulator.msaaSamples).toBe(samples);
      accumulator.dispose();
    }
  );

  it.each([0, 4] as const)(
    "keeps hybrid FP16 scene MSAA=%s with FP32 accumulation",
    (samples) => {
      const renderer = buildRenderer();
      const accumulator = buildSharedSceneAccumulator(2, {
        format: "rgba16f-32f",
        msaaSamples: samples,
      });
      accumulator.renderRound(renderer, 8, 8, () => undefined);
      const [scene, accumulation] = vi.mocked(renderer.readRenderTargetPixels)
        .mock.calls;
      expect(scene[0].texture.type).toBe(HalfFloatType);
      expect(scene[5]).toBeInstanceOf(Uint16Array);
      expect(scene[0].samples).toBe(samples);
      expect(accumulator.msaaSamples).toBe(samples);
      expect(accumulation[0].texture.type).toBe(FloatType);
      expect(accumulation[5]).toBeInstanceOf(Float32Array);
      expect(accumulation[0].samples).toBe(0);
      expect(accumulation[0].texture.minFilter).toBe(NearestFilter);
      expect(accumulation[0].texture.magFilter).toBe(NearestFilter);
      expect(scene[0].texture.minFilter).toBe(NearestFilter);
      accumulator.renderRound(renderer, 8, 8, () => undefined);
      expect(accumulator.composite(renderer)).toBe(true);
      const compositeScene = vi.mocked(renderer.render).mock.calls.at(-1)?.[0];
      const compositeMaterial = (compositeScene?.children[0] as Mesh)
        .material as ShaderMaterial;
      expect(compositeMaterial.uniforms.tColor.value.type).toBe(FloatType);
      accumulator.ensureState("new solar position");
      expect(accumulator.composite(renderer, true)).toBe(true);
      expect(compositeMaterial.uniforms.tColor.value.type).toBe(FloatType);
      expect(accumulator.broken).toBe(false);
      accumulator.dispose();
    }
  );

  it("stores scalar visibility in RED without assuming portable RED readback", () => {
    const renderer = buildRenderer();
    const accumulator = buildSharedSceneAccumulator(1, {
      format: "r16f",
      msaaSamples: 0,
    });
    accumulator.renderRound(renderer, 8, 8, () => undefined);
    const target = vi.mocked(renderer.setRenderTarget).mock.calls[0][0]!;
    expect(target.texture.format).toBe(RedFormat);
    expect(renderer.readRenderTargetPixels).not.toHaveBeenCalled();
    expect(accumulator.composite(renderer)).toBe(true);
    accumulator.dispose();
  });

  it("stores hybrid scalar samples in R16F and the running mask in R32F", () => {
    const renderer = buildRenderer();
    const accumulator = buildSharedSceneAccumulator(1, {
      format: "r16f-32f",
      msaaSamples: 4,
    });
    accumulator.renderRound(renderer, 8, 8, () => undefined);
    const [scene, accumulation] = vi.mocked(renderer.setRenderTarget).mock
      .calls;
    expect(scene[0]?.texture.type).toBe(HalfFloatType);
    expect(scene[0]?.texture.format).toBe(RedFormat);
    expect(scene[0]?.samples).toBe(4);
    expect(accumulation[0]?.texture.type).toBe(FloatType);
    expect(accumulation[0]?.texture.format).toBe(RedFormat);
    expect(accumulation[0]?.samples).toBe(0);
    expect(renderer.readRenderTargetPixels).not.toHaveBeenCalled();
    expect(accumulator.composite(renderer)).toBe(true);
    const compositeScene = vi.mocked(renderer.render).mock.calls.at(-1)?.[0];
    const material = (compositeScene?.children[0] as Mesh)
      .material as ShaderMaterial;
    expect(material.uniforms.uMonochrome.value).toBe(true);
    accumulator.dispose();
  });
  it("preserves aspect ratio while fitting a pixel budget", () => {
    const size = fitRenderTargetSizeToPixelBudget(1_170, 2_532, 1_000_000);

    expect(size.width * size.height).toBeLessThanOrEqual(1_000_000);
    expect(size.width / size.height).toBeCloseTo(1_170 / 2_532, 2);
    expect(fitRenderTargetSizeToPixelBudget(800, 600, 1_000_000)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("accumulates the configured rounds and resets on state changes", () => {
    const renderer = buildRenderer();
    const accumulator = buildSharedSceneAccumulator(2);
    const renderScene = vi.fn();

    accumulator.ensureState("first");
    accumulator.renderRound(renderer, 8, 4, renderScene);
    expect(accumulator.composite(renderer)).toBe(false);
    accumulator.renderRound(renderer, 8, 4, renderScene);
    expect(accumulator.composite(renderer)).toBe(true);

    expect(renderScene).toHaveBeenCalledTimes(2);
    const [sceneRead, accumRead] = vi.mocked(renderer.readRenderTargetPixels)
      .mock.calls;
    expect(sceneRead[0].texture.type).toBe(HalfFloatType);
    expect(accumRead[0].texture.type).toBe(FloatType);
    expect(sceneRead[0].samples).toBe(4);
    expect(sceneRead[5]).toBeInstanceOf(Uint16Array);
    // Tone mapping belongs only in the display composite, after HDR averaging.
    const compositeScene = vi.mocked(renderer.render).mock.calls.at(-1)?.[0];
    const compositeMaterial = (compositeScene?.children[0] as Mesh)
      .material as ShaderMaterial;
    expect(
      compositeMaterial.fragmentShader.indexOf("toneMapping(color.rgb)")
    ).toBeLessThan(
      compositeMaterial.fragmentShader.indexOf("linearToOutputTexel(color)")
    );
    expect(compositeMaterial.dithering).toBe(true);
    expect(
      compositeMaterial.fragmentShader.indexOf("dithering(outColor.rgb)")
    ).toBeGreaterThan(
      compositeMaterial.fragmentShader.indexOf("linearToOutputTexel(color)")
    );
    expect(
      vi.mocked(renderer.readRenderTargetPixels).mock.calls[1]?.[5]
    ).toBeInstanceOf(Float32Array);
    expect(accumulator.converged).toBe(true);
    expect(accumulator.hasSettledFrame).toBe(true);
    expect(accumulator.nextRound).toBe(2);
    accumulator.ensureState("second");
    expect(accumulator.nextRound).toBe(0);
    expect(accumulator.hasSettledFrame).toBe(true);
    expect(accumulator.composite(renderer, true)).toBe(true);
    expect(accumulator.composite(renderer)).toBe(false);
    accumulator.dispose();
  });

  it("marks an unusable blend pipeline as broken", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const accumulator = buildSharedSceneAccumulator(1);

    accumulator.renderRound(buildRenderer(true), 4, 4, () => undefined);

    expect(accumulator.broken).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    accumulator.dispose();
    error.mockRestore();
  });

  it("falls back when render target setup throws", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const renderer = buildRenderer();
    vi.mocked(renderer.setRenderTarget).mockImplementationOnce(() => {
      throw new Error("allocation failed");
    });
    const accumulator = buildSharedSceneAccumulator(1);

    expect(() =>
      accumulator.renderRound(renderer, 4_096, 4_096, () => undefined)
    ).not.toThrow();
    expect(accumulator.broken).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    accumulator.dispose();
    error.mockRestore();
  });
});
