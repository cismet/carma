import { createUnlitCustomShaderConstructorOptions } from "../shaders";
import { CustomShaderConstructorOptions } from "../types";

export const UNLIT: CustomShaderConstructorOptions =
  createUnlitCustomShaderConstructorOptions({
    gammaCorrection: [1.0, 1.0, 1.0],
    blackPoint: [0.0, 0.0, 0.0],
    whitePoint: [1.0, 1.0, 1.0],
    saturation: 1.0,
  });
