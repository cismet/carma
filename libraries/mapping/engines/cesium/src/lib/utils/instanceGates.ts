import {
  Camera,
  Scene,
  Viewer,
  CesiumTerrainProvider,
  ImageryProvider,
  ImageryLayer,
  EllipsoidTerrainProvider,
  Cesium3DTileset,
} from "cesium";

export const isValidViewerInstance = (viewer: unknown): viewer is Viewer =>
  viewer instanceof Viewer && viewer.isDestroyed() === false;

const isValidScene = (scene: unknown): scene is Scene =>
  scene instanceof Scene && scene.isDestroyed() === false;

const isValidCamera = (camera: unknown): camera is Camera =>
  camera instanceof Camera;

const isValidCanvas = (canvas: unknown): canvas is HTMLCanvasElement =>
  canvas instanceof HTMLCanvasElement;

export const isValidCesiumTerrainProvider = (
  provider: unknown
): provider is CesiumTerrainProvider => {
  return provider instanceof CesiumTerrainProvider;
};

export const isValidEllipsoidTerrainProvider = (
  provider: unknown
): provider is EllipsoidTerrainProvider => {
  return provider instanceof EllipsoidTerrainProvider;
};

export const isValidImageryProvider = (
  provider: unknown
): provider is ImageryProvider => {
  return provider instanceof ImageryProvider;
};

export const isValidImageryLayer = (
  imageryLayer: unknown
): imageryLayer is ImageryLayer => {
  return (
    imageryLayer instanceof ImageryLayer &&
    imageryLayer.isDestroyed() === false &&
    imageryLayer.ready === true
  );
};

export const isValidTileset = (
  tileset: unknown
): tileset is Cesium3DTileset => {
  return tileset instanceof Cesium3DTileset && tileset.isDestroyed() === false;
};

export const isValidViewer = (viewer: Viewer | null): viewer is Viewer => {
  if (!isValidViewerInstance(viewer)) return false;
  if (!viewer.scene || !isValidScene(viewer.scene)) return false;

  if (!viewer.camera || !isValidCamera(viewer.camera)) return false;
  if (!viewer.canvas || !isValidCanvas(viewer.canvas)) return false;
  return true;
};

/**
 * Validates a Cesium viewer and executes a callback if valid
 */
export const withValidViewer = (
  viewer: Viewer | null,
  cb: (viewer: Viewer) => void
): boolean => {
  if (!isValidViewer(viewer)) return false;
  cb(viewer);
  return true;
};
