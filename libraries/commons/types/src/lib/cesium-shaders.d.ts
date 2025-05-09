import type {
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  LightingModel,
  UniformSpecifier,
  VaryingType,
} from "cesium";

export interface CesiumCustomChaderOptions {
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
