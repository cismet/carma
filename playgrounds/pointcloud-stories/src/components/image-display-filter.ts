import * as THREE from "three";
import {
  dot,
  fwidth,
  materialColor,
  mix,
  saturation,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from "three/tsl";

export const IMAGE_DISPLAY_DEFAULT_SATURATION = 1;
export const IMAGE_DISPLAY_DEFAULT_CONTRAST = 1;
export const IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT = 0;
export const IMAGE_DISPLAY_MAXIMUM_EDGE_ENHANCEMENT = 2;

export const createImageDisplayFilter = (
  initialSaturation = IMAGE_DISPLAY_DEFAULT_SATURATION,
  initialContrast = IMAGE_DISPLAY_DEFAULT_CONTRAST,
  initialEdgeEnhancement = IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT
) => {
  const saturationUniform = uniform(initialSaturation);
  const contrastUniform = uniform(initialContrast);
  const edgeEnhancementUniform = uniform(initialEdgeEnhancement);

  const apply = (sourceColor: ReturnType<typeof vec3>) => {
    const desaturated = saturation(sourceColor, saturationUniform);
    const contrasted = desaturated
      .sub(0.5)
      .mul(contrastUniform)
      .add(0.5)
      .clamp(0, 1);
    const luminance = dot(contrasted, vec3(0.2126, 0.7152, 0.0722));
    // fwidth is a compact screen-space high-pass response. It emphasizes
    // discontinuities without extra texture samples or another image pyramid.
    const discontinuity = smoothstep(0.012, 0.11, fwidth(luminance));
    const edgeStrength = discontinuity
      .mul(edgeEnhancementUniform)
      .clamp(0, 0.86);
    return mix(contrasted, contrasted.mul(0.24), edgeStrength);
  };
  const colorNode = vec4(apply(vec3(materialColor)), 1);

  return {
    apply,
    colorNode,
    setValues: (
      nextSaturation: number,
      nextContrast: number,
      nextEdgeEnhancement: number
    ) => {
      saturationUniform.value = THREE.MathUtils.clamp(nextSaturation, 0, 1);
      contrastUniform.value = THREE.MathUtils.clamp(nextContrast, 0, 2);
      edgeEnhancementUniform.value = THREE.MathUtils.clamp(
        nextEdgeEnhancement,
        0,
        IMAGE_DISPLAY_MAXIMUM_EDGE_ENHANCEMENT
      );
    },
  };
};

export type ImageDisplayFilter = ReturnType<typeof createImageDisplayFilter>;

export const applyImageDisplayFilterToMaterial = (
  material: THREE.Material,
  filter: ImageDisplayFilter
) => {
  const nodeMaterial = material as THREE.Material & {
    colorNode?: ImageDisplayFilter["colorNode"];
  };
  nodeMaterial.colorNode = filter.colorNode;
  material.needsUpdate = true;
};
