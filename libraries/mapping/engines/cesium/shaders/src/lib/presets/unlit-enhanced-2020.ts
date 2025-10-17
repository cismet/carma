import { createUnlitCustomShaderConstructorOptions } from "../shaders";
import { CustomShaderConstructorOptions } from "../types";

export const UNLIT_ENHANCED_2020: CustomShaderConstructorOptions =
  createUnlitCustomShaderConstructorOptions({
    gammaCorrection: [1.0, 1.0, 1.25],
    blackPoint: [0.02, 0.02, 0.02],
    whitePoint: [0.75, 0.75, 0.75],
    saturation: 1.0,
  });
