import type {
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  LightingModel,
  UniformSpecifier,
  VaryingType,
} from "cesium";

/**
 * Cesium CustomShader constructor options
 * Matches official Cesium API: https://cesium.com/learn/cesiumjs/ref-doc/CustomShader.html
 */

export interface CustomShaderConstructorOptions {
  mode?: CustomShaderMode;
  lightingModel?: LightingModel;
  translucencyMode?: CustomShaderTranslucencyMode;
  uniforms?: {
    [key: string]: UniformSpecifier;
  };
  varyings?: {
    [key: string]: VaryingType;
  };
  vertexShaderText?: string;
  fragmentShaderText?: string;
}

/**
 * Simplified uniform config for UNLIT shaders with color correction
 */
export type UnlitShaderUniforms = {
  gammaCorrection: [number, number, number];
  blackPoint: [number, number, number];
  whitePoint: [number, number, number];
  saturation: number;
  fogIntensity?: number;
  maxFog?: number;
  fogColor?: [number, number, number];
};
