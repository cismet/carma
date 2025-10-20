import { CustomShader } from "cesium";
import * as PRESETS from "./presets";
import { ensureCustomShader } from "./shaders";

/**
 * All available shader presets
 */
export const SHADER_PRESETS = PRESETS;

/**
 * Get a CustomShader instance from a preset definition by name
 * Only instantiates when called, not on import
 */
export const getCustomShader = (presetName: string): CustomShader => {
  const preset = PRESETS[presetName as keyof typeof PRESETS];
  if (!preset) {
    throw new Error(`Unknown shader preset: ${presetName}`);
  }
  return ensureCustomShader(preset);
};
