import {
  Camera,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  CesiumTerrainProvider,
  CesiumWidget,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  EllipsoidTerrainProvider,
  Entity,
  Globe,
  GroundPrimitive,
  HeadingPitchRange,
  ImageryProvider,
  ImageryLayer,
  PolylineCollection,
  PrimitiveCollection,
  Ray,
  ScreenSpaceCameraController,
  Scene,
  ScreenSpaceEventHandler,
  Viewer,
} from "cesium";

export const isValidCesiumWidget = (widget: unknown): widget is CesiumWidget =>
  widget instanceof CesiumWidget && widget.isDestroyed() === false;

export const isValidScene = (scene: unknown): scene is Scene =>
  scene instanceof Scene && scene.isDestroyed() === false;

/**
 * @deprecated Use CesiumWidget and Scene directly instead of Viewer.
 * Viewer is a high-level API that includes UI controls we don't use.
 * Prefer: widget.scene, widget.camera over viewer.scene, viewer.camera
 */
export const isValidViewer = (viewer: unknown): viewer is Viewer => {
  if (!(viewer instanceof Viewer) || viewer.isDestroyed()) return false;
  if (!viewer.scene || !isValidScene(viewer.scene)) return false;
  if (!viewer.camera || !isValidCamera(viewer.camera)) return false;
  if (!viewer.canvas || !isValidCanvas(viewer.canvas)) return false;
  return true;
};

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

export const isValidCartesian2 = (
  cartesian: unknown
): cartesian is Cartesian2 => cartesian instanceof Cartesian2;

export const isValidCartesian3 = (
  cartesian: unknown
): cartesian is Cartesian3 => cartesian instanceof Cartesian3;

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

export const isValidHeadingPitchRange = (
  headingPitchRange: unknown
): headingPitchRange is HeadingPitchRange => {
  return headingPitchRange instanceof HeadingPitchRange;
};

export const isValidGlobe = (globe: unknown): globe is Globe => {
  return globe instanceof Globe;
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

export const isValidRay = (ray: unknown): ray is Ray => {
  return ray instanceof Ray;
};

export const isValidTileset = (
  tileset: unknown
): tileset is Cesium3DTileset => {
  return tileset instanceof Cesium3DTileset && tileset.isDestroyed() === false;
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

// TODO deprecate

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
 * Validates a CesiumWidget and executes a callback if valid
 */
export const withValidCesiumWidget = (
  widget: CesiumWidget | null,
  cb: (widget: CesiumWidget) => void
): boolean => {
  if (!isValidCesiumWidget(widget)) return false;
  cb(widget);
  return true;
};

/**
 * @deprecated Use withValidCesiumWidget or direct scene/camera access instead.
 * Viewer is a high-level API that includes UI controls we don't use.
 * Kept for reference and legacy code compatibility.
 */
export const withValidViewer = (
  viewer: Viewer | null,
  cb: (viewer: Viewer) => void
): boolean => {
  if (!isValidViewer(viewer)) return false;
  cb(viewer);
  return true;
};

// Safe Callback Helpers
export const tryWithValidCamera = (
  camera: unknown,
  cb: (camera: Camera) => void,
  label: string = "camera"
) => {
  if (!isValidCamera(camera)) {
    console.error(`tryWithValidCamera had invalid Camera ${label}`);
    return;
  }
  try {
    cb(camera);
  } catch (e) {
    console.error(`tryWithValidCamera failed on ${label}`, e);
  }
};

export const tryWithValidScene = (
  scene: unknown,
  cb: (scene: Scene) => void,
  label: string = "scene"
) => {
  if (!isValidScene(scene)) {
    console.error(`tryWithValidScene had invalid Scene ${label}`);
    return;
  }
  try {
    cb(scene);
  } catch (e) {
    console.error(`tryWithValidScene failed on ${label}`, e);
  }
};
