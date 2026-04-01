import type {
  CameraStateHeadingPitchRoll,
  CameraStateRecord,
} from "./carma-helpers/camera/Types";
import {
  BoundingSphere,
  Camera,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  CesiumTerrainProvider,
  CustomShader,
  EllipsoidTerrainProvider,
  Globe,
  GroundPrimitive,
  HeadingPitchRange,
  ImageryLayer,
  ImageryProvider,
  Model,
  PerspectiveFrustum,
  Scene,
  ScreenSpaceCameraController,
  ScreenSpaceEventHandler,
} from "./cesium";
import { ModelGraphics } from "cesium";
export const isValidBoundingSphere = (
  sphere: unknown
): sphere is BoundingSphere => sphere instanceof BoundingSphere;

export const isValidCartesian2 = (
  cartesian: unknown
): cartesian is Cartesian2 => cartesian instanceof Cartesian2;

export const isValidCartesian3 = (
  cartesian: unknown
): cartesian is Cartesian3 => cartesian instanceof Cartesian3;

export const isValidTileset = (tileset: unknown): tileset is Cesium3DTileset =>
  tileset instanceof Cesium3DTileset && tileset.isDestroyed() === false;

export const isValidCesiumTerrainProvider = (
  provider: unknown
): provider is CesiumTerrainProvider =>
  provider instanceof CesiumTerrainProvider;

export const isValidCustomShader = (shader: unknown): shader is CustomShader =>
  shader instanceof CustomShader;

export const isValidEllipsoidTerrainProvider = (
  provider: unknown
): provider is EllipsoidTerrainProvider =>
  provider instanceof EllipsoidTerrainProvider;

export const isValidGlobe = (globe: unknown): globe is Globe =>
  globe instanceof Globe;

export const isValidGroundPrimitive = (
  groundPrimitive: unknown
): groundPrimitive is GroundPrimitive =>
  groundPrimitive instanceof GroundPrimitive &&
  groundPrimitive.isDestroyed() === false;

export const isValidHeadingPitchRange = (
  headingPitchRange: unknown
): headingPitchRange is HeadingPitchRange =>
  headingPitchRange instanceof HeadingPitchRange;

export const isValidImageryLayer = (
  imageryLayer: unknown
): imageryLayer is ImageryLayer =>
  imageryLayer instanceof ImageryLayer &&
  imageryLayer.isDestroyed() === false &&
  imageryLayer.ready === true;

export const isValidImageryProvider = (
  provider: unknown
): provider is ImageryProvider => provider instanceof ImageryProvider;

export const isValidModel = (model: unknown): model is Model =>
  model instanceof Model;

export const isValidModelGraphics = (
  modelGraphics: unknown
): modelGraphics is ModelGraphics => modelGraphics instanceof ModelGraphics;

export const isPerspectiveFrustum = (
  frustum: unknown
): frustum is PerspectiveFrustum => frustum instanceof PerspectiveFrustum;

export const isValidScene = (scene: unknown): scene is Scene =>
  scene instanceof Scene && scene.isDestroyed() === false;

export const isValidScreenSpaceCameraController = (
  controller: unknown
): controller is ScreenSpaceCameraController =>
  controller instanceof ScreenSpaceCameraController &&
  controller.isDestroyed() === false;

export const isValidScreenSpaceEventHandler = (
  handler: unknown
): handler is ScreenSpaceEventHandler =>
  handler instanceof ScreenSpaceEventHandler && handler.isDestroyed() === false;

export const isValidCamera = (camera: unknown): camera is Camera =>
  camera instanceof Camera;

export const isCameraStateRecord = (
  camera: unknown
): camera is CameraStateRecord => {
  const candidate = camera as CameraStateRecord;
  return (
    candidate &&
    typeof candidate === "object" &&
    candidate.position !== undefined &&
    candidate.direction !== undefined &&
    candidate.up !== undefined
  );
};

export const isCameraStateHeadingPitchRoll = (
  camera: unknown
): camera is CameraStateHeadingPitchRoll => {
  const candidate = camera as CameraStateHeadingPitchRoll;
  return (
    candidate &&
    typeof candidate === "object" &&
    candidate.longitude !== undefined &&
    candidate.latitude !== undefined &&
    candidate.altitude !== undefined &&
    candidate.heading !== undefined &&
    candidate.pitch !== undefined
  );
};
