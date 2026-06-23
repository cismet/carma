import { LightingModel, UniformType, Cartesian3 } from "cesium";

// Shared fragment shader for all UNLIT variants
const UNLIT_FRAGMENT_SHADER = `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
{
    // Apply color correction and gamma in one step
    vec3 color = pow(
        clamp((material.diffuse - u_blackPoint) / (u_whitePoint - u_blackPoint), 0.0, 1.0),
        u_gammaCorrection
    );
    
    // Apply saturation only if not 1.0
    if (u_saturation != 1.0) {
        float luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
        color = mix(vec3(luminance), color, u_saturation);
    }
    
    material.diffuse = color;
    
    // Apply fog if intensity > 0
    if (u_fogIntensity > 0.0) {
        float distance = length(fsInput.attributes.positionEC);
        float fogFactor = min(1.0 - exp(-distance * u_fogIntensity), u_maxFog);
        material.diffuse = mix(material.diffuse, u_fogColor, fogFactor);
    }
}
`;

// Shared uniforms for all UNLIT variants
const createUnlitUniforms = (
  gammaCorrection: [number, number, number],
  blackPoint: [number, number, number],
  whitePoint: [number, number, number],
  saturation: number
) => ({
  u_fogIntensity: {
    type: UniformType.FLOAT,
    value: 0.0,
  },
  u_maxFog: {
    type: UniformType.FLOAT,
    value: 1.0,
  },
  u_fogColor: {
    type: UniformType.VEC3,
    value: new Cartesian3(0.7, 0.8, 0.9),
  },
  u_gammaCorrection: {
    type: UniformType.VEC3,
    value: new Cartesian3(...gammaCorrection),
  },
  u_blackPoint: {
    type: UniformType.VEC3,
    value: new Cartesian3(...blackPoint),
  },
  u_whitePoint: {
    type: UniformType.VEC3,
    value: new Cartesian3(...whitePoint),
  },
  u_saturation: {
    type: UniformType.FLOAT,
    value: saturation,
  },
});

export const CUSTOM_SHADERS_DEFINITIONS = {
  UNDEFINED: {},
  CLAY: {
    lightingModel: LightingModel.PBR,
    fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
    {
        material.diffuse = vec3(1.0, 1.0, 0.8); // egg or clay
        material.roughness = 0.5;
    }
    `,
  },
  UNLIT_ENHANCED_2020: {
    lightingModel: LightingModel.UNLIT,
    uniforms: createUnlitUniforms(
      [1.0, 1.0, 1.25],
      [0.02, 0.02, 0.02],
      [0.75, 0.75, 0.75],
      1.0
    ),
    fragmentShaderText: UNLIT_FRAGMENT_SHADER,
  },
  UNLIT_ENHANCED_2024: {
    lightingModel: LightingModel.UNLIT,
    uniforms: createUnlitUniforms(
      [1.25, 1.25, 1.23],
      [0.0, 0.0, 0.0],
      [0.9, 0.9, 0.92],
      1.0
    ),
    fragmentShaderText: UNLIT_FRAGMENT_SHADER,
  },
  UNLIT: {
    lightingModel: LightingModel.UNLIT,
    uniforms: createUnlitUniforms(
      [1.0, 1.0, 1.0],
      [0.0, 0.0, 0.0],
      [1.0, 1.0, 1.0],
      1.0
    ),
    fragmentShaderText: UNLIT_FRAGMENT_SHADER,
  },
  MONOCHROME: {
    lightingModel: LightingModel.UNLIT,
    uniforms: createUnlitUniforms(
      [1.0, 1.0, 1.25],
      [-0.1, -0.1, -0.1],
      [0.9, 0.9, 0.9],
      0.0
    ),
    fragmentShaderText: UNLIT_FRAGMENT_SHADER,
  },
};
