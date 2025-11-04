/**
 * Cesium Engine API - Flat Export Structure
 *
 * All Cesium types and utilities exported directly
 * No artificial folder hierarchy - matches Cesium's flat API
 */

// Pure re-exports from Cesium
export {
  ClassificationType,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
  ConstantProperty,
  defined,
  Ellipsoid,
  // Entity intentionally left out - use PrimitiveCollections in Scene instead
  // EasingFunction // EquivalentEasing is @carma-commons/math
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  LightingModel,
  Math as CesiumMath,
  Material,
  Matrix3,
  Matrix4,
  PolygonGeometry,
  PolygonHierarchy,
  Polyline,
  PolylineCollection,
  PolylineColorAppearance,
  PrimitiveCollection,
  Quaternion,
  Ray,
  SceneMode,
  SceneTransforms,
  ScreenSpaceEventType,
  // Shaders, // moved to @carma-mapping/engines/cesium/shaders
  ShadowMode,
  Transforms,
  // Viewer intentionally left out - use CesiumWidget instead
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
} from "cesium";

// augmented exports
export * from "./BoundingSphere";
export * from "./Camera";
export * from "./Cartesian2";
export * from "./Cartesian3";
export * from "./Cartographic";
export * from "./Cesium3DTileset";
export * from "./CesiumTerrainProvider";
export * from "./CesiumWidget";
export * from "./Color";
export * from "./CustomShader";
export * from "./EllipsoidTerrainProvider";
export * from "./Globe";
export * from "./GroundPrimitive";
export * from "./HeadingPitchRange";
export * from "./HeadingPitchRoll";
export * from "./ImageryLayer";
export * from "./ImageryProvider";
export * from "./Model";
export * from "./ModelGraphics";
export * from "./OpenStreetMapImageryProvider";
export * from "./PerspectiveFrustum";
export * from "./Rectangle";
export * from "./sampleTerrainMostDetailed";
export * from "./Scene";
// eslint-disable-next-line import/export
export * from "./ScreenSpaceCameraController";
export * from "./ScreenSpaceEventHandler";
export * from "./SingleTileImageryProvider";
export * from "./TileMapServiceImageryProvider";
export * from "./version";
