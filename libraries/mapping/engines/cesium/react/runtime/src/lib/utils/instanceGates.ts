import {
  Camera,
  Cesium3DTileset,
  CesiumTerrainProvider,
  CesiumWidget,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  EllipsoidTerrainProvider,
  GroundPrimitive,
  ImageryLayer,
  ImageryProvider,
  PolylineCollection,
  PrimitiveCollection,
  Scene,
  ScreenSpaceCameraController,
  ScreenSpaceEventHandler,
} from "@carma-cesium";

export const isValidCesiumWidgetInstance = (
  runtime: unknown
): runtime is CesiumWidget =>
  runtime instanceof CesiumWidget && runtime.isDestroyed() === false;

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
): provider is CesiumTerrainProvider =>
  provider instanceof CesiumTerrainProvider;

export const isValidEllipsoidTerrainProvider = (
  provider: unknown
): provider is EllipsoidTerrainProvider =>
  provider instanceof EllipsoidTerrainProvider;

export const isValidImageryProvider = (
  provider: unknown
): provider is ImageryProvider => provider instanceof ImageryProvider;

export const isValidImageryLayer = (
  imageryLayer: unknown
): imageryLayer is ImageryLayer =>
  imageryLayer instanceof ImageryLayer &&
  imageryLayer.isDestroyed() === false &&
  imageryLayer.ready === true;

export const isValidTileset = (tileset: unknown): tileset is Cesium3DTileset =>
  tileset instanceof Cesium3DTileset && tileset.isDestroyed() === false;

export const isValidRuntime = (
  runtime: CesiumWidget | null
): runtime is CesiumWidget => {
  if (!isValidCesiumWidgetInstance(runtime)) return false;
  if (!runtime.scene || !isValidScene(runtime.scene)) return false;
  if (!runtime.camera || !isValidCamera(runtime.camera)) return false;
  if (!runtime.canvas || !isValidCanvas(runtime.canvas)) return false;
  return true;
};

export const isValidCesiumWidget = isValidRuntime;

export const isValidClippingPlaneCollection = (
  collection: unknown
): collection is ClippingPlaneCollection =>
  collection instanceof ClippingPlaneCollection &&
  collection.isDestroyed() === false;

export const isValidClippingPolygonCollection = (
  collection: unknown
): collection is ClippingPolygonCollection =>
  collection instanceof ClippingPolygonCollection &&
  collection.isDestroyed() === false;

export const isValidPolylineCollection = (
  collection: unknown
): collection is PolylineCollection =>
  collection instanceof PolylineCollection &&
  collection.isDestroyed() === false;

export const isValidPrimitiveCollection = (
  collection: unknown
): collection is PrimitiveCollection =>
  collection instanceof PrimitiveCollection &&
  collection.isDestroyed() === false;

export const isValidGroundPrimitive = (
  groundPrimitive: unknown
): groundPrimitive is GroundPrimitive =>
  groundPrimitive instanceof GroundPrimitive &&
  groundPrimitive.isDestroyed() === false;

export const withValidCesiumWidget = (
  runtime: CesiumWidget | null,
  cb: (runtime: CesiumWidget) => void
): boolean => {
  if (!isValidRuntime(runtime)) return false;
  cb(runtime);
  return true;
};
