import { createUnlitCustomShaderConstructorOptions } from "../shaders";
import { CustomShaderConstructorOptions } from "../types";

export const MONOCHROME: CustomShaderConstructorOptions =
  createUnlitCustomShaderConstructorOptions({
    gammaCorrection: [1.0, 1.0, 1.25],
    blackPoint: [-0.1, -0.1, -0.1],
    whitePoint: [0.9, 0.9, 0.9],
    saturation: 0.0,
  });
