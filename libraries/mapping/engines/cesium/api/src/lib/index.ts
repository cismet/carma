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
  applyObjectCentricCameraViewToScene,
  applyRollToHeadingForCameraNearNadir,
  animateOrbitHeadingPitchRange,
  buildObjectCentricCameraOrientation,
  cameraPositionCartographicDegrees,
  cameraPositionCartographicRadians,
  cameraToHeadingPitchJson,
  captureCurrentCameraState,
  DEFAULT_OBJECT_CENTRIC_RANGE_M,
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
} from "./carma-helpers/camera";
export type {
  CaptureCurrentCameraStateOptions,
  CapturedCameraState,
  CameraState,
  CameraStateHeadingPitchRoll,
  CameraStateRecord,
  DirectionUp,
  ObjectCentricCameraOrientation,
  ObjectCentricCameraViewInput,
  ObjectCentricCameraViewOptions,
  OrbitHeadingPitchRangeAnimationOptions,
} from "./carma-helpers/camera";
export type {
  FlyToBoundingSphereExtentOptions,
  FlyToPointsOptions,
} from "./carma-helpers/camera";
export { flyToBoundingSphereExtent, flyToPoints } from "./carma-helpers/camera";

export {
  cartesian3Distance,
  offsetCartesian3Positions,
} from "./carma-helpers/cartesian3";
export {
  cartesian3FromJson,
  cartesian3ToJson,
  isCartesian3Json,
} from "./serialization";
export type {
  Cartesian3ConstructorArgs,
  Cartesian3Json,
} from "./serialization";

export {
  getDegreesFromCartographic,
  getEllipsoidalAltitudeOrZero,
} from "./carma-helpers/cartographic";
export { cartographicFromJson, cartographicToJson, isCartographicJson } from "./serialization";
export type { CartographicJson, CartographicJsonTyped } from "./serialization";
export {
  cartesian3FromCartographicRad,
  cartographicRadFromCartesian3,
  cartographicRadFromJson,
  cartographicRadToJson,
  isCartographicRadJson,
} from "./serialization";
export type { CartographicRadJson } from "./serialization";

export {
  isQuaternionJson,
  quaternionFromJson,
  quaternionToJson,
} from "./serialization";
export type { QuaternionJson } from "./serialization";

export { errorFromJson, errorToJson, isSerializedError } from "./serialization";
export type { SerializedError } from "./serialization";

export { guardTileset } from "./carma-helpers/tileset/TilesetGuard";
export type { Cesium3DTilesetConstructorOptions } from "./serialization";

export { createMinimalCesiumWidget } from "./carma-helpers/widget";

export {
  colorFromJson,
  colorFromConstructorArgs,
  colorToJson,
  colorToConstructorArgs,
  isColorJson,
  isColorConstructorArgs,
} from "./serialization";
export type { ColorConstructorArgs, ColorJson } from "./serialization";

export { newHeadingPitchRange } from "./carma-helpers/heading-pitch-range/HeadingPitchRangeFactory";
export type {
  HeadingPitchRangeJson,
  HeadingPitchRangeJsonRaw,
} from "./serialization";

export type {
  HeadingPitchJson,
  HeadingPitchRollDegreesJson,
  HeadingPitchRollJson,
  HeadingPitchRollJsonRaw,
  SerializedPerspectiveFrustum,
  SerializedOrthographicFrustum,
  SerializedOrthographicOffCenterFrustum,
  SerializedCesiumFrustum,
  CapturedCameraState as SerializedCapturedCameraState,
  CameraStateRecord as SerializedCameraStateRecord,
  CameraStateHeadingPitchRoll as SerializedCameraStateHeadingPitchRoll,
  CameraState as SerializedCameraState,
} from "./serialization";

export {
  rectangleFromBBox,
  rectangleFromJson,
  rectangleToBBox,
  rectangleToJson,
} from "./serialization";
export type {
  RectangleConstructorArgs,
  RectangleJson,
  RectangleJsonRaw,
} from "./serialization";

export {
  ensureSceneReady,
  toSceneStateCartographicRad,
  toSceneStateMat4,
  toSceneStateQuat,
  toSceneStateVec3,
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
} from "./serialization";
export type {
  OpenStreetMapImageryProviderConstructorOptionsJson,
  SingleTileImageryProviderConstructorOptionsJson,
  TileMapServiceImageryProviderConstructorOptionsJson,
  WebMapServiceImageryProviderConstructorOptionsJson,
  WebMapTileServiceProviderConstructorOptionsJson,
} from "./serialization";

export type { Matrix4ConstructorArgs } from "./serialization";
export { isMatrix4Json, matrix4FromJson, matrix4ToJson } from "./serialization";

export { SCENE_STATE_METADATA_SOURCE } from "./cesiumSceneTypes";
export type {
  CameraLike,
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

// custom low-level utilities
export * from "./carma-helpers/primitives";
export * from "./carma-helpers/scene/CoordinateAdapters";
export * from "./carma-helpers/scene/Occlusion";
export * from "./carma-helpers/scene/Picking";
export * from "./carma-helpers/cartographic/getDegreesFromCartesian";
export * from "./carma-helpers/cartographic/getBoundingSphereFromCoordinates";
export * from "./carma-helpers/camera/getFrustumPixelDimensionsForDistance";
export * from "./carma-helpers/terrain";
export * from "./carma-helpers/Transforms";
export * as CarmaTransforms from "./carma-helpers/Transforms";
export { getCesiumVersion } from "./carma-helpers/version";
