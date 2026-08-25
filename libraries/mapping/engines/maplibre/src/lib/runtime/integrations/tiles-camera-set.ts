import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";

export type TilesCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface TilesCameraSet {
  setActiveCamera: (camera: TilesCamera) => boolean;
  setCenterQualityBoost: (enabled: boolean) => void;
  update: (camera: TilesCamera, width: number, height: number) => void;
  dispose: () => void;
}

const copyCameraTransform = (target: TilesCamera, source: TilesCamera) => {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.up.copy(source.up);
  target.near = source.near;
  target.far = source.far;
};

const configureCoverageCamera = (target: TilesCamera, source: TilesCamera) => {
  copyCameraTransform(target, source);
  if (
    source instanceof THREE.PerspectiveCamera &&
    target instanceof THREE.PerspectiveCamera
  ) {
    target.fov = Math.min(
      150,
      THREE.MathUtils.radToDeg(
        2 * Math.atan(2 * Math.tan(THREE.MathUtils.degToRad(source.fov) / 2))
      )
    );
    target.aspect = source.aspect;
    target.zoom = source.zoom;
  } else if (
    source instanceof THREE.OrthographicCamera &&
    target instanceof THREE.OrthographicCamera
  ) {
    const centerX = (source.left + source.right) / 2;
    const centerY = (source.top + source.bottom) / 2;
    const halfWidth = (source.right - source.left) / 2;
    const halfHeight = (source.top - source.bottom) / 2;
    target.left = centerX - halfWidth * 2;
    target.right = centerX + halfWidth * 2;
    target.bottom = centerY - halfHeight * 2;
    target.top = centerY + halfHeight * 2;
    target.zoom = source.zoom;
  }
  target.updateProjectionMatrix();
  target.updateMatrixWorld(true);
};

const configureCenterCamera = (target: TilesCamera, source: TilesCamera) => {
  copyCameraTransform(target, source);
  if (
    source instanceof THREE.PerspectiveCamera &&
    target instanceof THREE.PerspectiveCamera
  ) {
    target.fov = Math.max(5, source.fov * 0.38);
    target.aspect = source.aspect;
    target.zoom = source.zoom;
  } else if (
    source instanceof THREE.OrthographicCamera &&
    target instanceof THREE.OrthographicCamera
  ) {
    const centerX = (source.left + source.right) / 2;
    const centerY = (source.top + source.bottom) / 2;
    const halfWidth = (source.right - source.left) * 0.19;
    const halfHeight = (source.top - source.bottom) * 0.19;
    target.left = centerX - halfWidth;
    target.right = centerX + halfWidth;
    target.bottom = centerY - halfHeight;
    target.top = centerY + halfHeight;
    target.zoom = source.zoom;
  }
  target.updateProjectionMatrix();
  target.updateMatrixWorld(true);
};

/**
 * Keeps the primary, peripheral-coverage, and optional center-detail cameras
 * used by the multimodal and MapLibre 3D Tiles renderers in sync.
 */
export const createTilesCameraSet = (
  tiles: TilesRenderer,
  initialCamera: TilesCamera,
  centerQualityBoost = false
): TilesCameraSet => {
  let activeCamera = initialCamera;
  let coverageCamera = activeCamera.clone() as TilesCamera;
  let centerCamera = activeCamera.clone() as TilesCamera;
  let centerBoostEnabled = centerQualityBoost;

  tiles.setCamera(activeCamera);
  tiles.setCamera(coverageCamera);
  if (centerBoostEnabled) tiles.setCamera(centerCamera);

  const update = (camera: TilesCamera, width: number, height: number) => {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    tiles.setResolution(camera, safeWidth, safeHeight);
    configureCoverageCamera(coverageCamera, camera);
    tiles.setResolution(
      coverageCamera,
      Math.max(8, Math.round(safeWidth / 128)),
      Math.max(8, Math.round(safeHeight / 128))
    );
    configureCenterCamera(centerCamera, camera);
    if (centerBoostEnabled) {
      tiles.setResolution(centerCamera, safeWidth * 2, safeHeight * 2);
    }
  };

  const setActiveCamera = (camera: TilesCamera) => {
    if (camera === activeCamera) return false;
    tiles.deleteCamera(activeCamera);
    tiles.deleteCamera(coverageCamera);
    if (centerBoostEnabled) tiles.deleteCamera(centerCamera);
    activeCamera = camera;
    coverageCamera = camera.clone() as TilesCamera;
    centerCamera = camera.clone() as TilesCamera;
    tiles.setCamera(activeCamera);
    tiles.setCamera(coverageCamera);
    if (centerBoostEnabled) tiles.setCamera(centerCamera);
    return true;
  };

  return {
    setActiveCamera,
    setCenterQualityBoost(enabled) {
      if (centerBoostEnabled === enabled) return;
      centerBoostEnabled = enabled;
      if (enabled) tiles.setCamera(centerCamera);
      else tiles.deleteCamera(centerCamera);
    },
    update,
    dispose() {
      tiles.deleteCamera(activeCamera);
      tiles.deleteCamera(coverageCamera);
      if (centerBoostEnabled) tiles.deleteCamera(centerCamera);
    },
  };
};
