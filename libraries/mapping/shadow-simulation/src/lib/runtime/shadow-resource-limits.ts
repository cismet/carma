import type { WebGLRenderer } from "three";
import {
  DEFAULT_SHADOW_QUALITY,
  SHADOW_QUALITY_PROFILES,
  SHADOW_BUFFER_FORMAT,
  SHADOW_MSAA_MAX,
  type ShadowQualityMultiplier,
  type ShadowRenderQualityOptions,
} from "../core/shadow-types";

const PHONE_MAX_SHADOW_MAP_SIZE = 2_048;
const TABLET_MAX_SHADOW_MAP_SIZE = 4_096;
const DESKTOP_MAX_SHADOW_MAP_SIZE = 4_096;
const PHONE_MAX_ACCUMULATION_PIXELS = 1_000_000;
const TABLET_MAX_ACCUMULATION_PIXELS = 2_000_000;

export type ShadowResourceEnvironment = Readonly<{
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}>;

export type ShadowResourceLimits = Readonly<{
  maxShadowMapSize: number;
  maxAccumulationPixels: number;
}>;

const readEnvironment = (): ShadowResourceEnvironment => {
  if (typeof navigator === "undefined") {
    return { userAgent: "", platform: "", maxTouchPoints: 0 };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
};

export const resolveShadowResourceLimits = (
  reportedMaxTextureSize: number,
  environment = readEnvironment()
): ShadowResourceLimits => {
  const maxTextureSize = Math.max(256, Math.floor(reportedMaxTextureSize));
  const phone = /iPhone|iPod|Android.+Mobile/i.test(environment.userAgent);
  const tablet =
    /iPad|Android(?!.*Mobile)/i.test(environment.userAgent) ||
    (environment.platform === "MacIntel" && environment.maxTouchPoints > 1);

  if (phone) {
    return {
      maxShadowMapSize: Math.min(maxTextureSize, PHONE_MAX_SHADOW_MAP_SIZE),
      maxAccumulationPixels: PHONE_MAX_ACCUMULATION_PIXELS,
    };
  }
  if (tablet) {
    return {
      maxShadowMapSize: Math.min(maxTextureSize, TABLET_MAX_SHADOW_MAP_SIZE),
      maxAccumulationPixels: TABLET_MAX_ACCUMULATION_PIXELS,
    };
  }
  return {
    maxShadowMapSize: Math.min(maxTextureSize, DESKTOP_MAX_SHADOW_MAP_SIZE),
    maxAccumulationPixels: Number.POSITIVE_INFINITY,
  };
};

/** Depth-only budget; existing device memory ceilings remain authoritative. */
export const resolveShadowDepthTexelBudget = (
  maxShadowMapSize: number,
  quality: ShadowQualityMultiplier = DEFAULT_SHADOW_QUALITY,
  physicalPixels = 2560 * 1440,
  scale = 1
) =>
  Math.floor(
    Math.max(
      256 ** 2,
      Math.min(
        maxShadowMapSize ** 2,
        SHADOW_QUALITY_PROFILES[quality].depthSize ** 2 *
          (Number.isFinite(physicalPixels) && physicalPixels > 0
            ? physicalPixels / (2560 * 1440)
            : 1) *
          scale ** 2
      )
    )
  );

type RenderCapabilities = Readonly<{
  maxTextureSize: number;
  maxRenderbufferSize: number;
  hdrSamples: readonly number[];
  sdrSamples: readonly number[];
}>;
const capabilities = new WeakMap<WebGLRenderer, RenderCapabilities>();
export const getShadowRenderCapabilities = (renderer: WebGLRenderer) => {
  const cached = capabilities.get(renderer);
  if (cached) return cached;
  // Three's type also includes legacy WebGL1; this renderer requires WebGL2.
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const depthSamples = gl.getInternalformatParameter(
    gl.RENDERBUFFER,
    gl.DEPTH_COMPONENT24,
    gl.SAMPLES
  ) as Int32Array;
  const samplesFor = (format: number) => [
    0,
    ...Array.from(
      gl.getInternalformatParameter(
        gl.RENDERBUFFER,
        format,
        gl.SAMPLES
      ) as Int32Array
    ).filter((samples) => depthSamples.includes(samples)),
  ];
  const result = {
    maxTextureSize: renderer.capabilities.maxTextureSize,
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    hdrSamples: samplesFor(gl.RGBA16F),
    sdrSamples: samplesFor(gl.RGBA8),
  };
  capabilities.set(renderer, result);
  return result;
};

export const resolveSupportedShadowMsaa = (
  options: Required<ShadowRenderQualityOptions>,
  supportedSamples: readonly number[]
) => {
  if (options.shadowBufferFormat === SHADOW_BUFFER_FORMAT.HDR_32) return 0;
  const requested =
    options.shadowMsaaSamples === SHADOW_MSAA_MAX
      ? Infinity
      : options.shadowMsaaSamples;
  return Math.max(
    0,
    ...supportedSamples.filter(
      (samples) => Number.isFinite(samples) && samples <= requested
    )
  );
};
