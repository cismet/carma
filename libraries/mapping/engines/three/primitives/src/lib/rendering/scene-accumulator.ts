import {
  AlwaysDepth,
  DepthTexture,
  FloatType,
  GLSL3,
  LinearFilter,
  Mesh,
  NearestFilter,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  Scene,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

import {
  DEFAULT_SCENE_ACCUMULATION_OPTIONS,
  resolveSceneAccumulationFormat,
  type SceneAccumulationOptions,
} from "./scene-accumulation-format";

// Accumulates sun-disc samples and preserves the final scene depth.

const COMPOSITE_VERTEX = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Three injects a pc_fragColor output only for shaders it upgrades itself;
// an explicitly GLSL3 ShaderMaterial declares its own fragment output.
const BLEND_FRAGMENT = /* glsl */ `
  layout(location = 0) out highp vec4 outColor;
  in vec2 vUv;
  uniform sampler2D tPrevious;
  uniform sampler2D tRound;
  uniform float uRoundWeight;
  void main() {
    outColor = mix(
      texture(tPrevious, vUv),
      texture(tRound, vUv),
      uRoundWeight
    );
  }
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>
  layout(location = 0) out highp vec4 outColor;
  in vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tUnshadowed;
  uniform sampler2D tIndirect;
  uniform bool uOutputDither;
  uniform bool uMonochrome;
  uniform bool uLighting;
  void main() {
    vec4 color = texture(tColor, vUv);
    if (uMonochrome) {
      if (uLighting) {
        vec4 unshadowed = texture(tUnshadowed, vUv);
        vec4 indirect = texture(tIndirect, vUv);
        color = vec4(
          indirect.rgb + color.r * (unshadowed.rgb - indirect.rgb),
          unshadowed.a
        );
      } else {
        color = vec4(vec3(color.r), 1.0);
      }
    }
    if (color.a < 0.004) discard;
    #ifdef TONE_MAPPING
      if (!uMonochrome || uLighting) color.rgb = toneMapping(color.rgb);
    #endif
    outColor = linearToOutputTexel(color);
    // Quantization dither belongs after tone mapping and output encoding,
    // never in the linear-light sun samples. Three's screen-space pattern is
    // static, so a settled frame neither flickers nor needs further repaints.
    #ifdef DITHERING
      if (uOutputDither) outColor.rgb = dithering(outColor.rgb);
    #endif
    gl_FragDepth = texture(tDepth, vUv).r;
  }
`;

/** Borrowed linear-light images registered to the accumulated scene camera. */
export type SceneAccumulationLighting = Readonly<{
  unshadowed: Texture;
  indirect: Texture;
}>;

export type SharedSceneAccumulator = {
  readonly msaaSamples: number;
  /** Set when the self-check failed; callers must render directly instead. */
  readonly broken: boolean;
  /** Whether every configured round has been blended in. */
  readonly converged: boolean;
  /** Whether a complete accumulation is available for reuse. */
  readonly hasSettledFrame: boolean;
  /** The round the next renderRound call will produce, 0-based. */
  readonly nextRound: number;
  /**
   * Restart when the state the rounds sample from has changed. Cheap to call
   * with the same key every frame.
   */
  ensureState: (stateKey: string) => void;
  /** Render one round of `renderScene` into the accumulation buffers. */
  renderRound: (
    renderer: WebGLRenderer,
    width: number,
    height: number,
    renderScene: () => void
  ) => void;
  /**
   * Draw an accumulated average plus scene depth into the current target.
   * Returns false when no suitable frame exists yet.
   */
  composite: (
    renderer: WebGLRenderer,
    preferSettled?: boolean,
    lighting?: SceneAccumulationLighting
  ) => boolean;
  dispose: () => void;
};

export const fitRenderTargetSizeToPixelBudget = (
  width: number,
  height: number,
  maxPixels: number
): Readonly<{ width: number; height: number }> => {
  const requestedWidth = Math.max(1, Math.floor(width));
  const requestedHeight = Math.max(1, Math.floor(height));
  if (
    !Number.isFinite(maxPixels) ||
    requestedWidth * requestedHeight <= maxPixels
  ) {
    return { width: requestedWidth, height: requestedHeight };
  }
  const scale = Math.sqrt(
    Math.max(1, Math.floor(maxPixels)) / (requestedWidth * requestedHeight)
  );
  return {
    width: Math.max(1, Math.floor(requestedWidth * scale)),
    height: Math.max(1, Math.floor(requestedHeight * scale)),
  };
};

export const buildSharedSceneAccumulator = (
  rounds: number,
  options: SceneAccumulationOptions = {}
): SharedSceneAccumulator => {
  const buffer = resolveSceneAccumulationFormat(options.format);
  // 32-bit float renderbuffers do not have portable multisample support.
  // Compare precision at MSAA=0 to avoid conflating the two quality axes.
  const msaaSamples =
    buffer.type === FloatType
      ? 0
      : options.msaaSamples ?? DEFAULT_SCENE_ACCUMULATION_OPTIONS.msaaSamples;
  let sceneTarget: WebGLRenderTarget | null = null;
  let settledSceneTarget: WebGLRenderTarget | null = null;
  let accumRead: WebGLRenderTarget | null = null;
  let accumWrite: WebGLRenderTarget | null = null;
  let settledAccum: WebGLRenderTarget | null = null;
  let width = 0;
  let height = 0;
  let round = 0;
  let stateKey = "";
  let selfChecked = false;
  let broken = false;
  let hasSettledFrame = false;

  const fullscreenScene = new Scene();
  const fullscreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blendMaterial = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: BLEND_FRAGMENT,
    uniforms: {
      tPrevious: { value: null as Texture | null },
      tRound: { value: null as Texture | null },
      uRoundWeight: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const compositeMaterial = new ShaderMaterial({
    dithering: true,
    glslVersion: GLSL3,
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: {
      tColor: { value: null as Texture | null },
      tDepth: { value: null as Texture | null },
      tUnshadowed: { value: null as Texture | null },
      tIndirect: { value: null as Texture | null },
      uOutputDither: { value: false },
      uMonochrome: { value: buffer.format === RedFormat },
      uLighting: { value: false },
    },
    transparent: true,
    blending: NormalBlending,
    // Depth is written from the stored scene depth; the test must always
    // pass for the write to happen at all.
    depthTest: true,
    depthFunc: AlwaysDepth,
    depthWrite: true,
  });
  const fullscreenMesh = new Mesh(new PlaneGeometry(2, 2), blendMaterial);
  fullscreenMesh.frustumCulled = false;
  fullscreenScene.add(fullscreenMesh);

  const disposeTargets = () => {
    sceneTarget?.depthTexture?.dispose();
    sceneTarget?.dispose();
    settledSceneTarget?.depthTexture?.dispose();
    settledSceneTarget?.dispose();
    accumRead?.dispose();
    accumWrite?.dispose();
    settledAccum?.dispose();
    sceneTarget = null;
    settledSceneTarget = null;
    accumRead = null;
    accumWrite = null;
    settledAccum = null;
    hasSettledFrame = false;
  };

  const ensureTargets = (nextWidth: number, nextHeight: number) => {
    if (sceneTarget && width === nextWidth && height === nextHeight) return;
    disposeTargets();
    width = nextWidth;
    height = nextHeight;
    const buildSceneTarget = () =>
      new WebGLRenderTarget(width, height, {
        // Preserve the full linear light range before averaging sun samples.
        // RGBA8 clips highlights and quantizes dark surface textures here,
        // even when the later accumulation buffer itself is floating point.
        type: buffer.type,
        format: buffer.format,
        minFilter:
          buffer.accumulationType === FloatType ? NearestFilter : LinearFilter,
        magFilter:
          buffer.accumulationType === FloatType ? NearestFilter : LinearFilter,
        depthBuffer: true,
        depthTexture: new DepthTexture(width, height),
        // Keep the camera registered to MapLibre's captured color/depth.
        // MSAA antialiases geometry without sub-pixel camera jitter, which
        // exposed dark seams in the screen-projected basemap during averaging.
        samples: msaaSamples,
      });
    sceneTarget = buildSceneTarget();
    settledSceneTarget = buildSceneTarget();
    // Hybrid targets quantize each scene sample once, but keep the running
    // mean in FP32 so increasing the sample count cannot compound FP16 stores.
    const accumOptions = {
      type: buffer.accumulationType,
      format: buffer.format,
      minFilter:
        buffer.accumulationType === FloatType ? NearestFilter : LinearFilter,
      magFilter:
        buffer.accumulationType === FloatType ? NearestFilter : LinearFilter,
      depthBuffer: false,
    } as const;
    accumRead = new WebGLRenderTarget(width, height, accumOptions);
    accumWrite = new WebGLRenderTarget(width, height, accumOptions);
    settledAccum = new WebGLRenderTarget(width, height, accumOptions);
    round = 0;
  };

  return {
    get msaaSamples() {
      return msaaSamples;
    },
    get broken() {
      return broken;
    },
    get converged() {
      return round >= rounds;
    },
    get hasSettledFrame() {
      return hasSettledFrame;
    },
    get nextRound() {
      return round;
    },
    ensureState(nextKey) {
      if (stateKey === nextKey) return;
      stateKey = nextKey;
      round = 0;
    },
    renderRound(renderer, nextWidth, nextHeight, renderScene) {
      const previousTarget = renderer.getRenderTarget();
      try {
        ensureTargets(nextWidth, nextHeight);
        if (!sceneTarget || !accumRead || !accumWrite) return;
        renderer.setRenderTarget(sceneTarget);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, false);
        renderScene();
        renderer.setRenderTarget(accumWrite);
        fullscreenMesh.material = blendMaterial;
        blendMaterial.uniforms.tPrevious.value = accumRead.texture;
        blendMaterial.uniforms.tRound.value = sceneTarget.texture;
        blendMaterial.uniforms.uRoundWeight.value = 1 / (round + 1);
        renderer.render(fullscreenScene, fullscreenCamera);
        renderer.setRenderTarget(previousTarget);
        // Fall back to direct rendering if the first blend pass produces no data.
        // Single-channel readPixels support varies by driver; its diagnostic
        // host validates via an RGBA float composite instead of reading RED.
        if (!selfChecked && round === 0 && buffer.format !== RedFormat) {
          selfChecked = true;
          const ScenePixelArray =
            buffer.type === FloatType
              ? Float32Array
              : buffer.type === UnsignedByteType
              ? Uint8Array
              : Uint16Array;
          const AccumulationPixelArray =
            buffer.accumulationType === FloatType
              ? Float32Array
              : buffer.accumulationType === UnsignedByteType
              ? Uint8Array
              : Uint16Array;
          const scenePixel = new ScenePixelArray(4);
          renderer.readRenderTargetPixels(
            sceneTarget,
            Math.floor(width / 2),
            Math.floor(height / 2),
            1,
            1,
            scenePixel
          );
          const accumPixel = new AccumulationPixelArray(4);
          renderer.readRenderTargetPixels(
            accumWrite,
            Math.floor(width / 2),
            Math.floor(height / 2),
            1,
            1,
            accumPixel
          );
          if (
            scenePixel[3] > 0 &&
            accumPixel[0] === 0 &&
            accumPixel[1] === 0 &&
            accumPixel[2] === 0 &&
            accumPixel[3] === 0
          ) {
            broken = true;
            console.error(
              "[shadow-simulation] accumulation self-check failed; falling back to direct rendering"
            );
          }
        }
        const swap = accumRead;
        accumRead = accumWrite;
        accumWrite = swap;
        round += 1;
        if (round >= rounds && settledAccum && settledSceneTarget) {
          const previousSettled = settledAccum;
          settledAccum = accumRead;
          accumRead = previousSettled;
          const previousSettledScene = settledSceneTarget;
          settledSceneTarget = sceneTarget;
          sceneTarget = previousSettledScene;
          hasSettledFrame = true;
        }
      } catch (error) {
        broken = true;
        disposeTargets();
        try {
          renderer.setRenderTarget(previousTarget);
        } catch {
          // The host renderer owns WebGL context restoration.
        }
        console.error(
          "[shadow-simulation] accumulation render target failed; falling back to direct rendering",
          error
        );
      }
    },
    composite(renderer, preferSettled = false, lighting) {
      if (
        !hasSettledFrame ||
        (!preferSettled && round < rounds) ||
        !settledAccum ||
        !settledSceneTarget
      ) {
        return false;
      }
      fullscreenMesh.material = compositeMaterial;
      compositeMaterial.uniforms.tColor.value = settledAccum.texture;
      compositeMaterial.uniforms.tDepth.value = settledSceneTarget.depthTexture;
      const composeLighting = buffer.format === RedFormat && lighting;
      compositeMaterial.uniforms.uLighting.value = Boolean(composeLighting);
      compositeMaterial.uniforms.tUnshadowed.value = composeLighting
        ? composeLighting.unshadowed
        : null;
      compositeMaterial.uniforms.tIndirect.value = composeLighting
        ? composeLighting.indirect
        : null;
      compositeMaterial.uniforms.uOutputDither.value =
        renderer.getRenderTarget() === null;
      renderer.render(fullscreenScene, fullscreenCamera);
      return true;
    },
    dispose() {
      disposeTargets();
      compositeMaterial.uniforms.tUnshadowed.value = null;
      compositeMaterial.uniforms.tIndirect.value = null;
      blendMaterial.dispose();
      compositeMaterial.dispose();
      fullscreenMesh.geometry.dispose();
    },
  };
};
