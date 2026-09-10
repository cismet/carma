import {
  FloatType,
  NearestFilter,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

import type {
  SceneAccumulationLighting,
  SharedSceneAccumulator,
} from "@carma-mapping/engines/three/primitives/rendering";

export type SunShadowImageDifference = Readonly<{
  maxAbsolute: number;
  rmsAbsolute: number;
  referencePeak: number;
  components: number;
}>;

/** Linear radiance/visibility readback; no display tone mapping or dithering. */
export const readSunShadowLinearImage = (
  renderer: WebGLRenderer,
  accumulator: SharedSceneAccumulator,
  width: number,
  height: number,
  lighting?: SceneAccumulationLighting
): Float32Array => {
  const previous = renderer.getRenderTarget();
  const target = new WebGLRenderTarget(width, height, {
    type: FloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  });
  const pixels = new Float32Array(width * height * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    if (!accumulator.composite(renderer, false, lighting))
      throw new Error("Image is not converged");
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    if (renderer.getContext().getError() !== 0)
      throw new Error("Float readback failed");
    return pixels;
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
  }
};

export const compareSunShadowLinearImages = (
  actual: Float32Array,
  reference: Float32Array
): SunShadowImageDifference => {
  if (actual.length !== reference.length)
    throw new Error("Image dimensions differ");
  let maxAbsolute = 0;
  let squared = 0;
  let referencePeak = 0;
  let components = 0;
  for (let index = 0; index < actual.length; index += 4) {
    if (reference[index + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const expected = reference[index + channel];
      const difference = Math.abs(actual[index + channel] - expected);
      if (!Number.isFinite(difference))
        throw new Error("Non-finite image value");
      maxAbsolute = Math.max(maxAbsolute, difference);
      referencePeak = Math.max(referencePeak, expected);
      squared += difference * difference;
      components += 1;
    }
  }
  if (!components) throw new Error("Empty reference image");
  return {
    maxAbsolute,
    rmsAbsolute: Math.sqrt(squared / components),
    referencePeak,
    components,
  };
};
