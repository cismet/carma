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

  tiles.setCamera(activeCamera);

  const update = (camera: TilesCamera, width: number, height: number) => {
    if (camera !== activeCamera) {
      tiles.deleteCamera(activeCamera);
      activeCamera = camera;
      tiles.setCamera(activeCamera);
    }
    tiles.setResolution(activeCamera, Math.max(1, width), Math.max(1, height));
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
      tiles.setResolution(
        shadowCamera,
        Math.max(1, Math.floor(view.shadowMapSize.width)),
        Math.max(1, Math.floor(view.shadowMapSize.height))
      );
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
