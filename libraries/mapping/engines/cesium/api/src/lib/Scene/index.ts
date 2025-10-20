/**
 * Scene rendering components
 * Mirrors https://github.com/CesiumGS/cesium/tree/main/packages/engine/Source/Scene
 */

// Scene components with guards
export * from "./Scene";
export * from "./Camera";
export * from "./Cesium3DTileset";
export * from "./Globe";
export * from "./ScreenSpaceCameraController";
export * from "./ScreenSpaceEventHandler";
export * from "./ScreenSpaceEventType";

// Frustum types
export * from "./PerspectiveFrustum";
export * from "./PerspectiveOffCenterFrustum";

// Imagery
export * from "./ImageryLayer";
export * from "./ImageryProvider";
export * from "./WebMapServiceImageryProvider";
export * from "./WebMapTileServiceImageryProvider";

// Terrain
export * from "./CesiumTerrainProvider";
export * from "./EllipsoidTerrainProvider";

// Terrain Samplers
export * from "./sampleTerrainMostDetailed";

// Collections
export * from "./ClippingPlaneCollection";
export * from "./ClippingPolygonCollection";
export * from "./PolylineCollection";
export * from "./PrimitiveCollection";

// Primitives
export * from "./GroundPrimitive";
export * from "./GroundPolylinePrimitive";
export * from "./Material";
export * from "./Polyline";
export * from "./PolylineColorAppearance";
//export * from "./Entity"; do not use
export * from "./GeometryInstance";
export * from "./ColorGeometryInstanceAttribute";

// Models
export * from "./Model";
export * from "./ModelGraphics";

// Transforms
export * from "./SceneTransform";

// Shaders
export * from "./CustomShader";

// Rendering constants
export { ShadowMode, LightingModel, SceneMode } from "cesium";

// Note: Viewer is discouraged - see utils/instanceGates.ts
