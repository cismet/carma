import { isFiniteNumber, Vector2 } from "@carma/math";
import type { SceneState } from "./sceneState";
import { radToDegNumeric } from "@carma/units/helpers";
import type { SceneViewState } from "./sceneViewState";
import type { CameraLike, SceneLike } from "./sceneStateTypes";
import {
  normalizeBearingRad,
  normalizeSignedRad,
  readAbsoluteHeightDeltaDistanceM,
  readSceneStateOrbitDistanceM,
  readVerticalFovRad,
} from "./sceneStateHelpers";

const readCameraPositionAnchor = (
  camera: CameraLike,
  fallbackHeightM: number
): SceneViewState["anchor"] | null => {
  const position = camera.positionCartographic;
  if (!position) {
    return null;
  }

  const lngDeg = radToDegNumeric(position.longitude)!;
  const latDeg = radToDegNumeric(position.latitude)!;
  if (!Number.isFinite(lngDeg) || !Number.isFinite(latDeg)) {
    return null;
  }

  return {
    lngDeg,
    latDeg,
    heightM: Number.isFinite(position.altitude)
      ? (position.altitude as number)
      : fallbackHeightM,
  };
};

const sampleScreenCenterAnchor = (
  scene: SceneLike,
  camera: CameraLike,
  fallbackHeightM: number
): SceneViewState["anchor"] | null => {
  const canvas = scene.canvas;
  const toCartographic = scene.globe?.ellipsoid?.cartesianToCartographic;
  if (!canvas || typeof toCartographic !== "function") {
    return null;
  }

  const centerScreenPosition = new Vector2(
    canvas.clientWidth * 0.5,
    canvas.clientHeight * 0.5
  );

  let pickedCartesian: unknown = null;
  if (scene.pickPositionSupported && typeof scene.pickPosition === "function") {
    pickedCartesian = scene.pickPosition(centerScreenPosition);
  }

  if (!pickedCartesian && typeof camera.getPickRay === "function") {
    const ray = camera.getPickRay(centerScreenPosition);
    if (ray && typeof scene.globe?.pick === "function") {
      pickedCartesian = scene.globe.pick(ray, scene);
    }
  }

  if (!pickedCartesian) {
    return null;
  }

  const pickedCartographic = toCartographic(pickedCartesian);
  if (!pickedCartographic) {
    return null;
  }

  const lngDeg = radToDegNumeric(pickedCartographic.longitude)!;
  const latDeg = radToDegNumeric(pickedCartographic.latitude)!;
  if (!Number.isFinite(lngDeg) || !Number.isFinite(latDeg)) {
    return null;
  }

  return {
    lngDeg,
    latDeg,
    heightM: Number.isFinite(pickedCartographic.altitude)
      ? (pickedCartographic.altitude as number)
      : fallbackHeightM,
  };
};

export type SceneViewStateReadOptions = {
  fallbackHeightM?: number;
};

export const readSceneViewStateFromSceneState = (
  sceneState: SceneState | null | undefined,
  options: SceneViewStateReadOptions = {}
): SceneViewState | null => {
  const { fallbackHeightM = 200 } = options;
  const cameraState = sceneState?.camera;
  if (!sceneState || !cameraState) {
    return null;
  }

  const cameraCartographic = cameraState.cartographic;
  const orbitCartographic = sceneState.orbitPoint?.cartographic ?? null;
  const anchorCartographic = orbitCartographic ?? cameraCartographic;

  if (!anchorCartographic) {
    return null;
  }

  const heightM = Number.isFinite(anchorCartographic.altitude)
    ? (anchorCartographic.altitude as number)
    : fallbackHeightM;

  const { bearingRad, pitchRad, rollRad } = cameraState;
  const fovVertical = cameraState.cameraModel?.intrinsics?.fov;
  const orientation: SceneViewState["orientation"] = {};
  if (isFiniteNumber(bearingRad))
    orientation.bearingRad = normalizeBearingRad(bearingRad);
  if (isFiniteNumber(pitchRad))
    orientation.pitchRad = normalizeSignedRad(pitchRad);
  if (isFiniteNumber(rollRad))
    orientation.rollRad = normalizeSignedRad(rollRad);
  if (isFiniteNumber(fovVertical)) orientation.fovVerticalRad = fovVertical;

  const rangeM =
    readSceneStateOrbitDistanceM(sceneState) ??
    readAbsoluteHeightDeltaDistanceM(cameraCartographic?.altitude, heightM);
  if (isFiniteNumber(rangeM)) orientation.rangeM = rangeM;

  return {
    anchor: {
      lngDeg: radToDegNumeric(anchorCartographic.longitude)!,
      latDeg: radToDegNumeric(anchorCartographic.latitude)!,
      heightM,
    },
    orientation,
  };
};

export const readSceneViewStateFromCamera = (
  camera: CameraLike,
  options: SceneViewStateReadOptions & { scene?: SceneLike | null } = {}
): SceneViewState | null => {
  const { scene, fallbackHeightM = 200 } = options;
  const anchor =
    (scene ? sampleScreenCenterAnchor(scene, camera, fallbackHeightM) : null) ??
    readCameraPositionAnchor(camera, fallbackHeightM);

  if (!anchor) {
    return null;
  }

  const orientation: SceneViewState["orientation"] = {};
  if (isFiniteNumber(camera.heading))
    orientation.bearingRad = normalizeBearingRad(camera.heading);
  if (isFiniteNumber(camera.pitch))
    orientation.pitchRad = normalizeSignedRad(camera.pitch);
  if (isFiniteNumber(camera.roll))
    orientation.rollRad = normalizeSignedRad(camera.roll);

  const fovVerticalRad = readVerticalFovRad(camera, scene);
  if (isFiniteNumber(fovVerticalRad))
    orientation.fovVerticalRad = fovVerticalRad;

  const rangeM = readAbsoluteHeightDeltaDistanceM(
    camera.positionCartographic?.altitude,
    anchor.heightM
  );
  if (isFiniteNumber(rangeM)) orientation.rangeM = rangeM;

  return { anchor, orientation };
};

export const readSceneViewStateFromScene = (
  scene: SceneLike | null | undefined,
  options: SceneViewStateReadOptions = {}
): SceneViewState | null => {
  const camera = scene?.camera;
  if (!camera) {
    return null;
  }

  return readSceneViewStateFromCamera(camera, {
    ...options,
    scene,
  });
};
