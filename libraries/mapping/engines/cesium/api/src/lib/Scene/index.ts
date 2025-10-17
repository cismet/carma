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

// Frustum types
export * from "./PerspectiveFrustum";
export * from "./PerspectiveOffCenterFrustum";

// Imagery
export * from "./ImageryLayer";
export * from "./ImageryProvider";

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

// Rendering constants
export { ShadowMode, LightingModel, SceneMode } from "cesium";

// Note: Viewer is discouraged - see utils/instanceGates.ts
