import { createUnlitCustomShaderConstructorOptions } from "../shaders";
import { CustomShaderConstructorOptions } from "../types";

export const UNLIT_ENHANCED_2024: CustomShaderConstructorOptions =
  createUnlitCustomShaderConstructorOptions({
    gammaCorrection: [1.25, 1.25, 1.23],
    blackPoint: [0.0, 0.0, 0.0],
    whitePoint: [0.9, 0.9, 0.92],
    saturation: 1.0,
  });
