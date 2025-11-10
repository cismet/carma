import {
  Camera,
  Cesium3DTileset,
  CesiumTerrainProvider,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  EllipsoidTerrainProvider,
  Entity,
  EntityCollection,
  GroundPrimitive,
  ImageryProvider,
  ImageryLayer,
  PolylineCollection,
  PrimitiveCollection,
  ScreenSpaceCameraController,
  Scene,
  ScreenSpaceEventHandler,
  Viewer,
} from "cesium";

import { logOnce } from "@carma-commons/utils";

logOnce("instanceGates.ts deprecates use @carma/cesium imports");

export const isValidViewerInstance = (viewer: unknown): viewer is Viewer =>
  viewer instanceof Viewer && viewer.isDestroyed() === false;

export const isValidScene = (scene: unknown): scene is Scene =>
  scene instanceof Scene && scene.isDestroyed() === false;

export const isValidScreenSpaceCameraController = (
  sscc: unknown
): sscc is ScreenSpaceCameraController =>
  sscc instanceof ScreenSpaceCameraController && sscc.isDestroyed() === false;

export const isValidScreenSpaceEventHandler = (
  handler: unknown
): handler is ScreenSpaceEventHandler =>
  handler instanceof ScreenSpaceEventHandler && handler.isDestroyed() === false;

export const isValidCamera = (camera: unknown): camera is Camera =>
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

// Collections

export const isValidClippingPlaneCollection = (
  collection: unknown
): collection is ClippingPlaneCollection => {
  return (
    collection instanceof ClippingPlaneCollection &&
    collection.isDestroyed() === false
  );
};

export const isValidClippingPolygonCollection = (
  collection: unknown
): collection is ClippingPolygonCollection => {
  return (
    collection instanceof ClippingPolygonCollection &&
    collection.isDestroyed() === false
  );
};

export const isValidEntityCollection = (
  collection: unknown
): collection is EntityCollection => {
  return collection instanceof EntityCollection;
};

export const isValidPolylineCollection = (
  collection: unknown
): collection is PolylineCollection => {
  return (
    collection instanceof PolylineCollection &&
    collection.isDestroyed() === false
  );
};

export const isValidPrimitiveCollection = (
  collection: unknown
): collection is PrimitiveCollection => {
  return (
    collection instanceof PrimitiveCollection &&
    collection.isDestroyed() === false
  );
};

// Entities

export const isValidEntity = (entity: unknown): entity is Entity => {
  return entity instanceof Entity;
};

// Primitives

export const isValidGroundPrimitive = (
  groundPrimitive: unknown
): groundPrimitive is GroundPrimitive => {
  return (
    groundPrimitive instanceof GroundPrimitive &&
    groundPrimitive.isDestroyed() === false
  );
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
