import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";

import type { SharedThreeSceneShadowView } from "./shared-three-scene-layer";

export type TilesCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface TilesCameraSet {
  update: (camera: TilesCamera, width: number, height: number) => void;
  setShadowView: (view: SharedThreeSceneShadowView | null) => void;
  dispose: () => void;
}

const isTilesCamera = (camera: THREE.Camera): camera is TilesCamera =>
  camera instanceof THREE.PerspectiveCamera ||
  camera instanceof THREE.OrthographicCamera;

export const resolveTilesViewCamera = (
  renderCamera: THREE.Camera,
  lodCamera: THREE.PerspectiveCamera
): TilesCamera => (isTilesCamera(renderCamera) ? renderCamera : lodCamera);

export const createTilesCameraSet = (
  tiles: TilesRenderer,
  initialCamera: TilesCamera
): TilesCameraSet => {
  let activeCamera = initialCamera;
  let shadowCamera: TilesCamera | null = null;
  let viewWidth = 1;
  let viewHeight = 1;

  tiles.setCamera(activeCamera);

  const update = (camera: TilesCamera, width: number, height: number) => {
    if (camera !== activeCamera) {
      tiles.deleteCamera(activeCamera);
      activeCamera = camera;
      tiles.setCamera(activeCamera);
    }
    viewWidth = Math.max(1, width);
    viewHeight = Math.max(1, height);
    tiles.setResolution(activeCamera, viewWidth, viewHeight);
    if (shadowCamera) {
      // The shadow camera expands selection to off-screen casters. Its render
      // target can be much larger than the display, but using that 16K buffer
      // as an LOD viewport would refine the mesh far beyond visible quality.
      tiles.setResolution(shadowCamera, viewWidth, viewHeight);
    }
  };

  const setShadowView = (view: SharedThreeSceneShadowView | null) => {
    const nextCamera = view?.camera;
    const validCamera =
      nextCamera && isTilesCamera(nextCamera) ? nextCamera : null;
    if (shadowCamera !== validCamera) {
      if (shadowCamera) tiles.deleteCamera(shadowCamera);
      shadowCamera = validCamera;
      if (shadowCamera) tiles.setCamera(shadowCamera);
    }
    if (shadowCamera && view) {
      tiles.setResolution(shadowCamera, viewWidth, viewHeight);
    }
  };

  return {
    update,
    setShadowView,
    dispose() {
      tiles.deleteCamera(activeCamera);
      if (shadowCamera) tiles.deleteCamera(shadowCamera);
    },
  };
};
