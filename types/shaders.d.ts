import type {
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  LightingModel,
  UniformSpecifier,
  VaryingType,
} from "cesium";

export type CesiumCustomChaderOptions = {
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
};
