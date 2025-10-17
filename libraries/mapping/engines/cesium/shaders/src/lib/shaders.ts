import {
  Cartesian3,
  CustomShader,
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  LightingModel,
  UniformSpecifier,
  UniformType,
} from "cesium";
import { UnlitShaderUniforms, CustomShaderConstructorOptions } from "./types";
import * as PRESETS from "./presets";

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

/**
 * Creates CustomShader constructor options for UNLIT shaders with color correction
 * Returns the options object, not the CustomShader instance
 */
export const createUnlitCustomShaderConstructorOptions = (
  uniforms: UnlitShaderUniforms
): CustomShaderConstructorOptions => {
  return {
    mode: CustomShaderMode.MODIFY_MATERIAL,
    lightingModel: LightingModel.UNLIT,
    translucencyMode: CustomShaderTranslucencyMode.INHERIT,
    fragmentShaderText: UNLIT_FRAGMENT_SHADER,
    uniforms: createUnlitUniforms(uniforms),
  };
};

/**
 * Helper to create a CustomShader with UNLIT lighting and color correction
 * Uses default CustomShaderMode.MODIFY_MATERIAL and CustomShaderTranslucencyMode.INHERIT
 */
export const createUnlitCustomShader = (
  uniforms: UnlitShaderUniforms
): CustomShader => {
  return new CustomShader(createUnlitCustomShaderConstructorOptions(uniforms));
};

/**
 * Creates Cesium uniform objects from shader uniform config
 * Converts plain data arrays into Cesium runtime objects (UniformSpecifier)
 */
export const createUnlitUniforms = (
  uniforms: UnlitShaderUniforms
): Record<string, UniformSpecifier> => ({
  u_fogIntensity: {
    type: UniformType.FLOAT,
    value: uniforms.fogIntensity ?? 0.0,
  },
  u_maxFog: {
    type: UniformType.FLOAT,
    value: uniforms.maxFog ?? 1.0,
  },
  u_fogColor: {
    type: UniformType.VEC3,
    value: uniforms.fogColor
      ? new Cartesian3(...uniforms.fogColor)
      : new Cartesian3(0.7, 0.8, 0.9),
  },
  u_gammaCorrection: {
    type: UniformType.VEC3,
    value: new Cartesian3(...uniforms.gammaCorrection),
  },
  u_blackPoint: {
    type: UniformType.VEC3,
    value: new Cartesian3(...uniforms.blackPoint),
  },
  u_whitePoint: {
    type: UniformType.VEC3,
    value: new Cartesian3(...uniforms.whitePoint),
  },
  u_saturation: {
    type: UniformType.FLOAT,
    value: uniforms.saturation,
  },
});

/**
 * Shader preset definitions - imported from individual preset files
 */
export const SHADER_PRESETS = PRESETS;

/**
 * Get a CustomShader instance from a preset definition
 * Only instantiates when called, not on import
 */
export const getCustomShader = (
  presetName: keyof typeof PRESETS
): CustomShader => {
  const preset = PRESETS[presetName];
  return ensureCustomShader(preset);
};

/**
 * Ensures the input is a CustomShader instance
 * - If already a CustomShader, returns it as-is
 * - If a constructor options object, creates a new CustomShader
 * - Otherwise throws an error
 */
export const ensureCustomShader = (input: unknown): CustomShader => {
  if (input instanceof CustomShader) {
    return input;
  }

  if (
    input !== null &&
    typeof input === "object" &&
    ("fragmentShaderText" in input ||
      "vertexShaderText" in input ||
      "uniforms" in input)
  ) {
    return new CustomShader(input as CustomShaderConstructorOptions);
  }

  throw new Error(
    `Invalid shader input: expected CustomShader instance or constructor options, got ${typeof input}`
  );
};
