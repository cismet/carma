import { CustomShader, LightingModel } from "cesium";

// Default highlight shader for selected 3D model entities
export const DEFAULT_MODEL_HIGHLIGHT_SHADER = new CustomShader({
  lightingModel: LightingModel.UNLIT,
  fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  material.diffuse = vec3(0.8, 0.8, 0.0);
  material.alpha = 1.0;
}
`,
});
