import {
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  LightingModel,
  UniformSpecifier,
  VaryingType,
} from "cesium";

export type CesiumConfig = {
  transitions: {
    mapMode: {
      duration: number;
    };
  };
  camera: {
    minPitch: number;
    minPitchRange: number;
  };
  markerKey?: string;
  markerAnchorHeight?: number;
  baseUrl: string;
  pathName: string;
};

export interface CustomShaderDefinition {
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