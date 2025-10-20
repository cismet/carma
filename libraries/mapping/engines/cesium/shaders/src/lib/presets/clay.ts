import { CustomShaderConstructorOptions } from "../types";
import { LightingModel } from "@carma/cesium";
import { CustomShaderMode, CustomShaderTranslucencyMode } from "cesium";

export const CLAY: CustomShaderConstructorOptions = {
  mode: CustomShaderMode.MODIFY_MATERIAL,
  lightingModel: LightingModel.PBR,
  translucencyMode: CustomShaderTranslucencyMode.INHERIT,
  fragmentShaderText: `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
      {
          material.diffuse = vec3(1.0, 1.0, 0.8);
          material.roughness = 0.5;
      }
      `,
};
