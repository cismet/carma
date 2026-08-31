const PHONE_MAX_SHADOW_MAP_SIZE = 2_048;
const TABLET_MAX_SHADOW_MAP_SIZE = 4_096;
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
    maxShadowMapSize: maxTextureSize,
    maxAccumulationPixels: Number.POSITIVE_INFINITY,
  };
};
