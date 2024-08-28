import { APP_BASE_PATH } from './app.config';
import { ModelAsset } from '@carma-mapping/cesium-engine';

const BEHOERDE_SVG = `${APP_BASE_PATH}data/img/behoerde.svg`;
export const GLB_SAMPLE = `${APP_BASE_PATH}data/glb/map_pointer.glb`;
const FROM_SVG_SAMPLE = `${APP_BASE_PATH}data/glb/behoerde.glb`;
// https://sketchfab.com/3d-models/map-pointer-162fba8901ea4ce5894d8b0916d802b4
// Placeholder asset - CC BY 4.0 DEED - thekiross

export const IMAGE_ASSETS: Record<string, ModelAsset> = {
  SvgMarker: { uri: BEHOERDE_SVG, scale: 0.5 },
};

export const MODEL_ASSETS: Record<string, ModelAsset> = {
  Marker: { uri: GLB_SAMPLE, scale: 20, anchorOffset: { z: 2 } },
  MarkerFacing: {
    uri: GLB_SAMPLE,
    scale: 20,
    isCameraFacing: true,
    anchorOffset: { z: 2 },
  },
  MarkerRotating: {
    uri: GLB_SAMPLE,
    scale: 20,
    anchorOffset: { z: 2 },
    rotation: true,
  },
  MarkerRotatingFast: {
    uri: GLB_SAMPLE,
    scale: 20,
    rotation: 2,
    anchorOffset: { z: 2 },
  },
  MarkerRotatingSlow: {
    uri: GLB_SAMPLE,
    scale: 20,
    anchorOffset: { z: 2 },
    rotation: 0.5,
  },
  MarkerRotatingCounter: {
    uri: GLB_SAMPLE,
    scale: 20,
    anchorOffset: { z: 2 },
    rotation: -1,
  },
  MarkerRotatingFixed: {
    uri: GLB_SAMPLE,
    scale: 20,
    anchorOffset: { z: 2 },
    rotation: true,
    fixedScale: true,
  },
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

  Wind: {
    uri: `${APP_BASE_PATH}data/glb/game_ready_wind_turbine_animated.glb`,
    scale: 85,
    anchorOffset: { z: 0 },
    hasAnimation: true,
  },
};

export default { MODEL_ASSETS, IMAGE_ASSETS };
