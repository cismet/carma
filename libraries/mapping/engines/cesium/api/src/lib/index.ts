/**
 * Cesium Engine API - Flat Export Structure
 *
 * All Cesium types and utilities exported directly
 * No artificial folder hierarchy - matches Cesium's flat API
 */

// Pure re-exports from Cesium
export {
  BoxGeometry,
  BoxOutlineGeometry,
  Cartesian4,
  ClassificationType,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  CoplanarPolygonGeometry,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
  ConstantProperty,
  defined,
  // Entity intentionally left out - use PrimitiveCollections in Scene instead
  // EasingFunction // EquivalentEasing is @carma-commons/math
  Ellipsoid,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  LightingModel,
  Math as CesiumMath,
  Material,
  Matrix3,
  Matrix4,
  NearFarScalar,
  PointPrimitiveCollection,
  PolygonGeometry,
  PolygonHierarchy,
  Polyline,
  PolylineCollection,
  PolylineColorAppearance,
  PolylineGeometry,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveCollection,
  Quaternion,
  Ray,
  SceneMode,
  SceneTransforms,
  ScreenSpaceEventType,
  // Shaders, // moved to @carma-mapping/engines/cesium/shaders
  ShadowMode,
  Transforms,
  VerticalOrigin,
  VertexFormat,
  // Viewer intentionally left out - use CesiumWidget instead
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  WallGeometry,
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
