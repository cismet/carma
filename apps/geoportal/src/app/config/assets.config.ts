import { ModelAsset } from "@carma-mapping/cesium-engine";

import { APP_BASE_PATH } from "./app.config";

// TODO CONSOLIDATE_CESIUM

const BEHOERDE_SVG = `${APP_BASE_PATH}data/img/behoerde.svg`;
export const GLB_SAMPLE = `${APP_BASE_PATH}data/glb/map_pointer.glb`;
const FROM_SVG_SAMPLE = `${APP_BASE_PATH}data/glb/behoerde.glb`;
// https://sketchfab.com/3d-models/map-pointer-162fba8901ea4ce5894d8b0916d802b4
// Placeholder asset - CC BY 4.0 DEED - thekiross

export const IMAGE_ASSETS: Record<string, ModelAsset> = {
  SvgMarker: { uri: BEHOERDE_SVG, scale: 0.5 },
};

export const MODEL_ASSETS: Record<string, ModelAsset> = {
  Marker: {
    uri: GLB_SAMPLE,
    scale: 8,
    rotation: false,
    isCameraFacing: true,
    fixedScale: true,
    anchorOffset: { z: 2 },
  },

  /*
  MarkerFacing: generateModelAsset({
    color: [0.0, 1.0, 0.0, 1.0],
    scale: 20,
    isCameraFacing: true,
  }),
  MarkerRotating: generateModelAsset({
    color: [0.0, 1.0, 0.0, 1.0],
    scale: 20,
    isCameraFacing: true,
    rotation: true,
  }),
  MarkerFixed: generateModelAsset({
    color: [0.0, 1.0, 0.0, 1.0],
    scale: 20,
    isCameraFacing: true,
    rotation: true,
    fixedScale: true,
  }),
  */
  MarkerFacingFixed: {
    uri: GLB_SAMPLE,
    scale: 20,
    anchorOffset: { z: 1 },
    isCameraFacing: true,
    fixedScale: true,
  },
  Marker3dFromSvg: {
    uri: FROM_SVG_SAMPLE,
    scale: 80,
    anchorOffset: { z: 0 },
    isCameraFacing: true,
    fixedScale: true,
  },
};

export default { MODEL_ASSETS, IMAGE_ASSETS };
