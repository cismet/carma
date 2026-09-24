import {
  readShadowDeviceEnvironment,
  resolveShadowDeviceClass,
  type ShadowDeviceEnvironment,
} from "../core/shadow-device-profile";
import {
  resolveSceneAccumulationFormat,
  DEFAULT_SCENE_ACCUMULATION_OPTIONS,
  type SceneAccumulationOptions,
} from "@carma-mapping/engines/three/primitives/rendering";
import type { WebGLRenderer } from "three";
import {
  DEFAULT_SHADOW_QUALITY,
  SHADOW_QUALITY_PROFILES,
  SHADOW_BUFFER_FORMAT,
  SHADOW_MSAA_MAX,
  type ShadowQualityMultiplier,
  type ShadowRenderQualityOptions,
} from "../core/shadow-types";

const PHONE_MAX_SHADOW_MAP_SIZE = 1_024;
const TABLET_MAX_SHADOW_MAP_SIZE = 2_048;
const DESKTOP_MAX_SHADOW_MAP_SIZE = 4_096;
const PHONE_MAX_ACCUMULATION_PIXELS = 1_000_000;
const TABLET_MAX_ACCUMULATION_PIXELS = 2_000_000;

export type ShadowResourceEnvironment = ShadowDeviceEnvironment;

export type ShadowResourceLimits = Readonly<{
  maxShadowMapSize: number;
  maxAccumulationPixels: number;
}>;

export const resolveShadowResourceLimits = (
  reportedMaxTextureSize: number,
  environment = readShadowDeviceEnvironment()
): ShadowResourceLimits => {
  const maxTextureSize = Math.max(256, Math.floor(reportedMaxTextureSize));
  const deviceClass = resolveShadowDeviceClass(environment);

  if (deviceClass === "phone") {
    return {
      maxShadowMapSize: Math.min(maxTextureSize, PHONE_MAX_SHADOW_MAP_SIZE),
      maxAccumulationPixels: PHONE_MAX_ACCUMULATION_PIXELS,
    };
  }
  if (deviceClass === "tablet") {
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

/** Two scene/depth targets (including MSAA) and three ping-pong/settled colors.
 * Mobile devices keep this working set below 256 MiB. An unbounded desktop
 * pixel budget preserves native-resolution HQ accumulation; it must not silently
 * fall back to hard shadows. Hardware limits and allocation failure still apply.
 * Decision: ../../../three/README.md#desktop-quality-isolation
 */
export const resolveShadowAccumulationPixelBudget = (
  devicePixels: number,
  options: SceneAccumulationOptions
) => {
  if (devicePixels === Number.POSITIVE_INFINITY) return devicePixels;
  const format = resolveSceneAccumulationFormat(options.format);
  const samples =
    options.msaaSamples ?? DEFAULT_SCENE_ACCUMULATION_OPTIONS.msaaSamples;
  const bytesPerPixel =
    2 * (format.bytesPerPixel + 4) * (1 + Math.max(0, samples)) +
    3 * format.accumulationBytesPerPixel;
  return Math.min(
    devicePixels,
    Math.floor((256 * 1024 * 1024) / bytesPerPixel)
  );
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
