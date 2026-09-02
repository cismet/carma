import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";

import type { SharedThreeSceneShadowView } from "./shared-three-scene-layer";
import { shadowFitChangedMaterially } from "./three-tiles-load-policy";
import type { ShadowFit } from "./three-tiles-load-policy";

export type TilesCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface TilesCameraSet {
  update: (camera: TilesCamera, width: number, height: number) => void;
  setShadowView: (view: SharedThreeSceneShadowView | null) => void;
  /** The privately registered shadow camera, while a shadow view is set. */
  getShadowCamera: () => THREE.OrthographicCamera | null;
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

const fitPosition = new THREE.Vector3();
const fitDirection = new THREE.Vector3();

/** Footprint of an orthographic camera in world space, for the hysteresis. */
const readShadowFit = (camera: THREE.OrthographicCamera): ShadowFit => {
  fitPosition.setFromMatrixPosition(camera.matrixWorld);
  fitDirection.set(0, 0, -1).transformDirection(camera.matrixWorld);
  return {
    center: [fitPosition.x, fitPosition.y, fitPosition.z],
    extent: [
      (camera.right - camera.left) / camera.zoom,
      (camera.top - camera.bottom) / camera.zoom,
      camera.far - camera.near,
    ],
    direction: [fitDirection.x, fitDirection.y, fitDirection.z],
  };
};

export const createTilesCameraSet = (
  tiles: TilesRenderer,
  initialCamera: TilesCamera
): TilesCameraSet => {
  let activeCamera = initialCamera;
  // The registered shadow camera is a private clone: the controller refits its
  // own camera on every content change, and re-posing the registered object
  // would re-trigger the traversal while the view is at rest.
  const shadowCamera = new THREE.OrthographicCamera();
  shadowCamera.name = "tiles-shadow-selection";
  let shadowCameraRegistered = false;
  let shadowFit: ShadowFit | null = null;
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
    if (shadowCameraRegistered) {
      // The shadow camera expands selection to off-screen casters. Its render
      // target can be much larger than the display, but using that 16K buffer
      // as an LOD viewport would refine the mesh far beyond visible quality.
      tiles.setResolution(shadowCamera, viewWidth, viewHeight);
    }
  };

  const applyShadowCamera = (source: THREE.OrthographicCamera) => {
    // Copy the pose and projection verbatim (the source is a light child, so
    // its world matrix is not reproducible from local transforms alone).
    shadowCamera.copy(source, false);
    shadowCamera.matrixWorldInverse.copy(source.matrixWorld).invert();
    shadowCamera.matrixWorldAutoUpdate = false;
  };

  const setShadowView = (view: SharedThreeSceneShadowView | null) => {
    const source = view?.camera;
    if (!(source instanceof THREE.OrthographicCamera)) {
      if (shadowCameraRegistered) {
        tiles.deleteCamera(shadowCamera);
        shadowCameraRegistered = false;
      }
      shadowFit = null;
      return;
    }
    source.updateMatrixWorld(true);
    const nextFit = readShadowFit(source);
    if (shadowFitChangedMaterially(shadowFit, nextFit)) {
      applyShadowCamera(source);
      shadowFit = nextFit;
    }
    if (!shadowCameraRegistered) {
      tiles.setCamera(shadowCamera);
      shadowCameraRegistered = true;
    }
    tiles.setResolution(shadowCamera, viewWidth, viewHeight);
  };

  return {
    update,
    setShadowView,
    getShadowCamera: () => (shadowCameraRegistered ? shadowCamera : null),
    dispose() {
      tiles.deleteCamera(activeCamera);
      if (shadowCameraRegistered) tiles.deleteCamera(shadowCamera);
      shadowCameraRegistered = false;
      shadowFit = null;
    },
  };
};
