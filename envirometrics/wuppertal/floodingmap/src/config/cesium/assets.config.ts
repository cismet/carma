import { ModelAsset } from "@carma-mapping/cesium-engine";

import { APP_BASE_PATH } from "../app.config";

export const GLB_SAMPLE = `${APP_BASE_PATH}data/glb/map_pointer.glb`;
// https://sketchfab.com/3d-models/map-pointer-162fba8901ea4ce5894d8b0916d802b4
// Placeholder asset - CC BY 4.0 DEED - thekiross

export const MODEL_ASSETS: Record<string, ModelAsset> = {
  MarkerSolidLine: {
    uri: GLB_SAMPLE,
    scale: 8,
    rotation: false,
    isCameraFacing: true,
    fixedScale: true,
    anchorOffset: { z: 0 },
    stemline: { color: [0.95, 0.8, 0.95, 0.75], width: 6, gap: 2, glow: false },
  },
  MarkerGlowLine: {
    uri: GLB_SAMPLE,
    scale: 8,
    rotation: false,
    isCameraFacing: true,
    fixedScale: true,
    anchorOffset: { z: 0 },
    stemline: { color: [0.8, 0.8, 0.95, 0.2], width: 10, gap: 0.5, glow: true },
  },
  MarkerFacingFixed: {
    uri: GLB_SAMPLE,
    scale: 20,
    anchorOffset: { z: 1 },
    isCameraFacing: true,
    fixedScale: true,
  },
};

export default { MODEL_ASSETS };
