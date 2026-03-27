/**
 * Cesium Engine API - Consolidated Export Surface
 *
 * Layering:
 * - `./cesium` raw curated Cesium re-exports (SSOT for Cesium symbols)
 * - `./carma-guards` runtime guards for Cesium objects
 * - `./cesiumSceneTypes` lightweight scene contracts
 * - `./carma-helpers/*` low-level Cesium-focused helpers
 * - `./serialization/*` JSON and constructor-arg codecs
 *
 * The top-level API stays explicit and curated. Local barrel files organize
 * each domain, but this file decides what becomes part of the public surface.
 */

// ---------------------------------------------------------------------------
// Raw curated Cesium re-exports
// ---------------------------------------------------------------------------

export * from "./cesium";

// ---------------------------------------------------------------------------
// Guards and lightweight scene contracts
// ---------------------------------------------------------------------------

export {
  isCameraStateHeadingPitchRoll,
  isCameraStateRecord,
  isPerspectiveFrustum,
  isValidBoundingSphere,
  isValidCamera,
  isValidCartesian2,
  isValidCartesian3,
  isValidCesiumTerrainProvider,
  isValidCustomShader,
  isValidEllipsoidTerrainProvider,
  isValidGlobe,
  isValidGroundPrimitive,
  isValidHeadingPitchRange,
  isValidImageryLayer,
  isValidImageryProvider,
  isValidModel,
  isValidModelGraphics,
  isValidScene,
  isValidScreenSpaceCameraController,
  isValidScreenSpaceEventHandler,
  isValidTileset,
} from "./carma-guards";

export { SCENE_STATE_METADATA_SOURCE } from "./cesiumSceneTypes";
export type {
  CameraBasis,
  CameraFrustum,
  CameraIntrinsics,
  CameraLike,
  CameraType,
  EventLike,
  FrustumLike,
  ObjectCentricCameraAnchor,
  ObjectCentricCameraModel,
  ObjectCentricCameraPose,
  OrbitPoint,
  OrbitPointMode,
  OrbitPointSamplingStrategy,
  OrbitPointSource,
  SceneCamera,
  SceneLighting,
  SceneLike,
  SceneState,
  SceneStateMetadata,
  SceneStateMetadataSource,
  SceneStateOptions,
} from "./cesiumSceneTypes";

// ---------------------------------------------------------------------------
// Camera helpers
// ---------------------------------------------------------------------------

export {
  applyRollToHeadingForCameraNearNadir,
  animateOrbitHeadingPitchRange,
  cameraPositionCartographicDegrees,
  cameraPositionCartographicRadians,
  cameraToHeadingPitchJson,
  captureCurrentCameraState,
  flyToCameraState,
  flyToBoundingSphereExtent,
  flyToPoints,
  flyToTarget,
  getHeadingPitchRollDiff,
  getTopDownCameraDeviationAngle,
  readPerspectiveFrustumVerticalFov,
  releaseCameraFromOrbitMode,
  setViewFromCameraState,
  tryWithValidCamera,
  validateCameraStateHeadingPitchRoll,
  writePerspectiveFrustumLongerEdgeFov,
  writePerspectiveFrustumVerticalFov,
  type CaptureCurrentCameraStateOptions,
  type CapturedCameraState,
  type CameraState,
  type CameraStateHeadingPitchRoll,
  type CameraStateRecord,
  type DirectionUp,
  type FlyCameraStateToSceneOptions,
  type FlyToBoundingSphereExtentOptions,
  type FlyToPointsOptions,
  type OrbitHeadingPitchRangeAnimationOptions,
} from "./carma-helpers/camera";

// ---------------------------------------------------------------------------
// Low-level Cesium helpers
// ---------------------------------------------------------------------------

export {
  cartesian3Distance,
  cartesian3ToVector3,
  offsetCartesian3Positions,
} from "./carma-helpers/cartesian3";
export {
  getDegreesFromCartographic,
  getEllipsoidalAltitudeOrZero,
} from "./carma-helpers/cartographic";
export { getCesiumVersion } from "./carma-helpers/version";
export { newHeadingPitchRange } from "./carma-helpers/heading-pitch-range/HeadingPitchRangeFactory";
export * from "./carma-helpers/primitives";
export {
  ensureSceneReady,
  toSceneStateCartographicRad,
  toSceneStateMat4,
  toSceneStateQuat,
  toSceneStateVec3,
  tryWithValidScene,
  waitForCondition,
  waitForRenderFrames,
  type SceneRenderStage,
} from "./carma-helpers/scene";
export * from "./carma-helpers/terrain";
export { guardTileset } from "./carma-helpers/tileset/TilesetGuard";
export { createMinimalCesiumWidget } from "./carma-helpers/widget";
export * from "./carma-helpers/Transforms";
export * as CarmaTransforms from "./carma-helpers/Transforms";

// ---------------------------------------------------------------------------
// Direct scene utility modules without local barrels
// ---------------------------------------------------------------------------

export * from "./carma-helpers/scene/CoordinateAdapters";
export * from "./carma-helpers/scene/Occlusion";
export * from "./carma-helpers/scene/Picking";
export * from "./carma-helpers/cartographic/getBoundingSphereFromCoordinates";
export * from "./carma-helpers/cartographic/getDegreesFromCartesian";
export * from "./carma-helpers/camera/getFrustumPixelDimensionsForDistance";

// ---------------------------------------------------------------------------
// Serialization: primitive values and JSON codecs
// ---------------------------------------------------------------------------

export {
  cartesian3FromJson,
  cartesian3ToJson,
  isCartesian3Json,
  cartographicFromJson,
  cartographicToJson,
  isCartographicJson,
  cartesian3FromCartographicRad,
  cartographicRadFromCartesian3,
  cartographicRadFromJson,
  cartographicRadToJson,
  isCartographicRadJson,
  isQuaternionJson,
  quaternionFromJson,
  quaternionToJson,
  colorFromConstructorArgs,
  colorFromJson,
  colorToConstructorArgs,
  colorToJson,
  isColorConstructorArgs,
  isColorJson,
  rectangleFromBBox,
  rectangleFromJson,
  rectangleToBBox,
  rectangleToJson,
  errorFromJson,
  errorToJson,
  isSerializedError,
  isMatrix4Json,
  matrix4FromJson,
  matrix4ToJson,
} from "./serialization";
export type {
  Cartesian3ConstructorArgs,
  Cartesian3Json,
  CartographicJson,
  CartographicJsonTyped,
  CartographicRadJson,
  QuaternionJson,
  ColorConstructorArgs,
  ColorJson,
  RectangleConstructorArgs,
  RectangleJson,
  RectangleJsonRaw,
  SerializedError,
  Matrix4ConstructorArgs,
} from "./serialization";

// ---------------------------------------------------------------------------
// Serialization: camera, frustum, and scene-adjacent DTOs
// ---------------------------------------------------------------------------

export type {
  CameraState as SerializedCameraState,
  CameraStateHeadingPitchRoll as SerializedCameraStateHeadingPitchRoll,
  CameraStateRecord as SerializedCameraStateRecord,
  CapturedCameraState as SerializedCapturedCameraState,
  HeadingPitchJson,
  HeadingPitchRangeJson,
  HeadingPitchRangeJsonRaw,
  HeadingPitchRollDegreesJson,
  HeadingPitchRollJson,
  HeadingPitchRollJsonRaw,
  SerializedCesiumFrustum,
  SerializedOrthographicFrustum,
  SerializedOrthographicOffCenterFrustum,
  SerializedPerspectiveFrustum,
} from "./serialization";

// ---------------------------------------------------------------------------
// Serialization: provider and tileset config DTOs
// ---------------------------------------------------------------------------

export {
  openStreetMapImageryProviderConstructorOptionsFromJson,
  singleTileImageryProviderConstructorOptionsFromJson,
  tileMapServiceImageryProviderConstructorOptionsFromJson,
  webMapServiceImageryProviderConstructorOptionsFromJson,
  webMapTileServiceProviderConstructorOptionsFromJson,
} from "./serialization";
export type {
  Cesium3DTilesetConstructorOptions,
  OpenStreetMapImageryProviderConstructorOptionsJson,
  SingleTileImageryProviderConstructorOptionsJson,
  TileMapServiceImageryProviderConstructorOptionsJson,
  WebMapServiceImageryProviderConstructorOptionsJson,
  WebMapTileServiceProviderConstructorOptionsJson,
} from "./serialization";
