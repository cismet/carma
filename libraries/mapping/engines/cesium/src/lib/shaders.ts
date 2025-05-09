import { LightingModel } from "cesium";
import type { CesiumCustomChaderOptions } from "@carma-commons/types";

export enum CustomShaderKeys {
  CLAY = "CLAY",
  UNLIT_ENHANCED_2020 = "UNLIT_ENHANCED_2020",
  UNLIT_ENHANCED_2024 = "UNLIT_ENHANCED_2024",
  UNLIT = "UNLIT",
  UNLIT_FOG = "UNLIT_FOG",
  UNDEFINED = "UNDEFINED",
  MONOCHROME = "MONOCHROME",
}

export const CUSTOM_SHADERS_DEFINITIONS: Record<
  CustomShaderKeys,
  CesiumCustomChaderOptions
> = {
  [CustomShaderKeys.UNDEFINED]: {},
  [CustomShaderKeys.CLAY]: {
    lightingModel: LightingModel.PBR,
    fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
    {
        material.diffuse = vec3(1.0, 1.0, 0.8); // egg or clay
        material.roughness = 0.5;   
    }
  `,
  },
  [CustomShaderKeys.UNLIT_ENHANCED_2020]: {
    lightingModel: LightingModel.UNLIT,
    fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
    {
        // This is tuned for a specific tileset texture, not generic
        // Apply gamma correction
        vec3 gammaCorrection = vec3(1.0,1.0,1.25); // reduce blue somewhat
        
        // Apply black point correction
        float blackPoint = 0.02; // stretch to black
        float whitePoint = 0.75; // stretch to white
         
        vec3 color = (material.diffuse - vec3(blackPoint)) / (vec3(whitePoint) - vec3(blackPoint));
        color = clamp(color, 0.0, 1.0); // Ensure values are in [0,1] range
    
        // Apply gamma correction after point adjustments
        material.diffuse = pow(color, gammaCorrection);
    }
    `,
  },
  [CustomShaderKeys.UNLIT_ENHANCED_2024]: {
    lightingModel: LightingModel.UNLIT,
    fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
    {
        // This is tuned for a specific tileset texture, not generic
        // Apply gamma correction
        vec3 gammaCorrection = vec3(1.25,1.25,1.23); // adjust color gamma per channel
        
        // Apply channel-specific clamping
        vec3 blackPoint = vec3(0.0,0.0,0.0); 
        vec3 whitePoint = vec3(0.90,0.90,0.92); 
         
        vec3 color = (material.diffuse - blackPoint) / (whitePoint - blackPoint);
        color = clamp(color, 0.0, 1.0); // Ensure values are in [0,1] range
    
        // Apply gamma correction after point adjustments
        material.diffuse = pow(color, gammaCorrection);
    }
    `,
  },
  [CustomShaderKeys.UNLIT_FOG]: {
    lightingModel: LightingModel.UNLIT,
    fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
    {
        // This is tuned for a specific tileset texture, not generic
        // Apply gamma correction
        vec3 gammaCorrection = vec3(1.0,1.0,1.25); // reduce blue somewhat
        
        // Apply black point correction
        float blackPoint = 0.02; // stretch to black
        float whitePoint = 0.75; // stretch to white
         
        vec3 color = (material.diffuse - vec3(blackPoint)) / (vec3(whitePoint) - vec3(blackPoint));
        color = clamp(color, 0.0, 1.0); // Ensure values are in [0,1] range
    
        // Apply gamma correction after point adjustments
        material.diffuse = pow(color, gammaCorrection);

        // apply fog

        // Calculate distance from camera
        float distance = length(fsInput.attributes.positionEC);
    
        float fogDensity = 0.00005;

        float fogFactor = min(1.0 - exp(-distance * fogDensity) ,0.5);

        material.diffuse = mix(material.diffuse, vec3(0.55, 0.6, 0.785), fogFactor);

    }
    `,
  },
  [CustomShaderKeys.UNLIT]: {
    lightingModel: LightingModel.UNLIT,
  },
  [CustomShaderKeys.MONOCHROME]: {
    lightingModel: LightingModel.UNLIT,
    fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
    {
        // This is tuned for a specific tileset texture, not generic
        // Apply gamma correction
        vec3 gammaCorrection = vec3(1.0,1.0,1.25); // reduce blue somewhat

        // Apply black point correction
        float blackPoint = -0.1; // more pale for washed out look
        float whitePoint = 0.9; // stretch to white

        vec3 color = (material.diffuse - vec3(blackPoint)) / (vec3(whitePoint) - vec3(blackPoint));
        color = clamp(color, 0.0, 1.0); // Ensure values are in [0,1] range

        // Apply gamma correction after point adjustments
        vec3 correctedColor = pow(color, gammaCorrection);
        float greyScale = 0.2126 * correctedColor.r + 0.7152 * correctedColor.g + 0.0722 * correctedColor.b; // https://en.wikipedia.org/wiki/Grayscale#Luma_coding_in_video_systems
        material.diffuse = vec3(greyScale);
    }
    `,
  },
};
