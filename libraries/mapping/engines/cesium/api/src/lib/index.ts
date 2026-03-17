/**
 * Cesium Engine API - Consolidated Export Surface
 *
 * Layering:
 * - `./cesium` raw curated Cesium re-exports (SSOT for Cesium symbols)
 * - `./*.ts` wrapper utilities/types (without re-exporting raw classes)
 * - `./carma-helpers/*` low-level helper utilities
 */

// raw curated Cesium re-exports
export * from "./cesium";

// wrapper utilities and types
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

export {
  applyRollToHeadingForCameraNearNadir,
  animateOrbitHeadingPitchRange,
  cameraPositionCartographicDegrees,
  cameraPositionCartographicRadians,
  cameraToHeadingPitchJson,
  captureCurrentCameraState,
  flyToTarget,
  getHeadingPitchRollDiff,
  getTopDownCameraDeviationAngle,
  releaseCameraFromOrbitMode,
  setViewFromCameraState,
  tryWithValidCamera,
  validateCameraStateHeadingPitchRoll,
} from "./carma-helpers/camera";
export type {
  CaptureCurrentCameraStateOptions,
  CapturedCameraState,
  CameraState,
  CameraStateHeadingPitchRoll,
  CameraStateRecord,
  DirectionUp,
  OrbitHeadingPitchRangeAnimationOptions,
} from "./carma-helpers/camera";
export type {
  FlyToBoundingSphereExtentOptions,
  FlyToPointsOptions,
} from "./carma-helpers/camera";
export {
  flyToBoundingSphereExtent,
  flyToPoints,
} from "./carma-helpers/camera";

export {
  cartesian3Distance,
  offsetCartesian3Positions,
} from "./carma-helpers/cartesian3";
export {
  cartesian3FromJson,
  cartesian3ToJson,
} from "./serialization/base";
export type { Cartesian3ConstructorArgs, Cartesian3Json } from "./serialization/base";

export {
  getDegreesFromCartographic,
  getEllipsoidalAltitudeOrZero,
} from "./carma-helpers/cartographic";
export { cartographicToJson } from "./serialization/base";
export type { CartographicJson, CartographicJsonTyped } from "./serialization/base";

export { guardTileset } from "./carma-helpers/tileset/TilesetGuard";
export type { Cesium3DTilesetConstructorOptions } from "./serialization/base";

export { createMinimalCesiumWidget } from "./carma-helpers/widget";

export {
  colorFromConstructorArgs,
  colorToConstructorArgs,
  isColorConstructorArgs,
} from "./serialization/base";
export type { ColorConstructorArgs, ColorJson } from "./serialization/base";

export { newHeadingPitchRange } from "./carma-helpers/heading-pitch-range/HeadingPitchRangeFactory";
export type { HeadingPitchRangeJson, HeadingPitchRangeJsonRaw } from "./serialization/base";

export type {
  HeadingPitchJson,
  HeadingPitchRollDegreesJson,
  HeadingPitchRollJson,
  HeadingPitchRollJsonRaw,
} from "./serialization/base";

export {
  rectangleFromBBox,
  rectangleFromJson,
  rectangleToBBox,
  rectangleToJson,
} from "./serialization/base";
export type { RectangleConstructorArgs, RectangleJson, RectangleJsonRaw } from "./serialization/base";

export {
  getCartographicAndHeadingPitchRangeFromPoints,
  getCartographicAndHeadingPitchRangeFromPoints as getCartographicAndHeadingPitchRangeFromWorldPoints,
  getPointsFromCartographicAndHeadingPitchRange,
  getPointsFromCartographicAndHeadingPitchRange as getWorldPointsFromCartographicAndHeadingPitchRange,
} from "./carma-helpers/Transforms";
export type {
  CartographicHeadingPitchRange,
  CartographicHeadingPitchRangePoints,
} from "./carma-helpers/Transforms";

export {
  ensureSceneReady,
  tryWithValidScene,
  waitForCondition,
  waitForRenderFrames,
} from "./carma-helpers/scene";
export type { SceneRenderStage } from "./carma-helpers/scene";

export {
  openStreetMapImageryProviderConstructorOptionsFromJson,
  singleTileImageryProviderConstructorOptionsFromJson,
  tileMapServiceImageryProviderConstructorOptionsFromJson,
  webMapServiceImageryProviderConstructorOptionsFromJson,
  webMapTileServiceProviderConstructorOptionsFromJson,
} from "./serialization/base";
export type {
  OpenStreetMapImageryProviderConstructorOptionsJson,
  SingleTileImageryProviderConstructorOptionsJson,
  TileMapServiceImageryProviderConstructorOptionsJson,
  WebMapServiceImageryProviderConstructorOptionsJson,
  WebMapTileServiceProviderConstructorOptionsJson,
} from "./serialization/base";

export type { Matrix4ConstructorArgs } from "./serialization/base";

// scene-state adapter (engine-agnostic DTOs + Cesium adapter)
export * from "./serialization/derived/computeCesiumSceneStateSnapshot";
export type {
  CameraLike,
  EventLike,
  FrustumLike,
  Mat4,
  Matrix4Like,
  OrbitPointMode,
  OrbitPointSamplingStrategy,
  OrbitPointSnapshot,
  OrbitPointSource,
  RayLike,
  SceneCameraSnapshot,
  SceneLike,
  SceneStateOptions,
  SceneStateSnapshot,
  Vec2,
  Vec3,
} from "@carma/types";
export type {
  CameraLike as CesiumCameraLike,
  EventLike as CesiumEventLike,
  FrustumLike as CesiumFrustumLike,
  Matrix4Like as CesiumMatrix4Like,
  OrbitPointMode as CesiumOrbitPointMode,
  OrbitPointSamplingStrategy as CesiumOrbitPointSamplingStrategy,
  OrbitPointSnapshot as CesiumOrbitPointSnapshot,
  OrbitPointSource as CesiumOrbitPointSource,
  RayLike as CesiumRayLike,
  SceneCameraSnapshot as CesiumSceneCameraSnapshot,
  SceneLike as CesiumSceneLike,
  SceneStateOptions as CesiumSceneStateOptions,
  SceneStateSnapshot as CesiumSceneStateSnapshot,
  Vec2 as CesiumVec2,
} from "@carma/types";
export type { LatLngAlt } from "@carma/geo/types";

// custom low-level utilities
export * from "./carma-helpers/primitives";
export * from "./carma-helpers/scene/CoordinateAdapters";
export * from "./carma-helpers/scene/Occlusion";
export * from "./carma-helpers/scene/Picking";
export * from "./carma-helpers/cartographic/getDegreesFromCartesian";
export * from "./carma-helpers/cartographic/getBoundingSphereFromCoordinates";
export * from "./carma-helpers/camera/getFrustumPixelDimensionsForDistance";
export * from "./carma-helpers/terrain";
export * from "./carma-helpers/scene-state";
export * from "./carma-helpers/Transforms";
export * as CarmaTransforms from "./carma-helpers/Transforms";
export { getCesiumVersion } from "./carma-helpers/version";
