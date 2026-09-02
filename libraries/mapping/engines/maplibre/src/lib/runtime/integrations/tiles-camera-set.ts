import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";

export type TilesCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface TilesCameraSet {
  update: (camera: TilesCamera, width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Tile selection always uses the true perspective LOD camera. The MapLibre
 * render camera carries the composite scene-to-clip projection, whose scaled
 * matrix inflates the screen-space error by the metres per pixel of the map.
 */
export const resolveTilesViewCamera = (
  _renderCamera: THREE.Camera,
  lodCamera: THREE.PerspectiveCamera
): TilesCamera => lodCamera;

export const createTilesCameraSet = (
  tiles: TilesRenderer,
  initialCamera: TilesCamera
): TilesCameraSet => {
  let activeCamera = initialCamera;

  tiles.setCamera(activeCamera);

  const update = (camera: TilesCamera, width: number, height: number) => {
    if (camera !== activeCamera) {
      tiles.deleteCamera(activeCamera);
      activeCamera = camera;
      tiles.setCamera(activeCamera);
    }
    tiles.setResolution(
      activeCamera,
      Math.max(1, width),
      Math.max(1, height)
    );
  };

  return {
    update,
    dispose() {
      tiles.deleteCamera(activeCamera);
    },
  };
};
