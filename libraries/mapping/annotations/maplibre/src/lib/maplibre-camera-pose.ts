import { removeVector3ComponentAlongAxis } from "@carma-commons/math";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Vector3 } from "three";
import {
  readEnuViewAngles,
  type EcefCameraPose,
} from "@carma-commons/camera/model";
import { degToRad, radToDegNumeric } from "@carma-units";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";

/**
 * MapLibre camera <-> ECEF pose through the scene's ECEF placement, the one
 * measurements are drawn with. Orientation is read against east, north and
 * up at the camera, sampled in the scene.
 */

const MAPLIBRE_CAMERA_POSE_DEFAULTS = Object.freeze({
  probeMeters: 10,
  tangentStepDegrees: 1e-5,
});

/** A unit direction carried from one frame into the other by a probe point. */
const carryDirection = (
  convert: (position: Vector3) => Vector3 | null,
  originFrom: Vector3,
  originTo: Vector3,
  direction: Vector3
) => {
  const carried = convert(
    originFrom
      .clone()
      .addScaledVector(direction, MAPLIBRE_CAMERA_POSE_DEFAULTS.probeMeters)
  )?.sub(originTo);
  return carried && carried.lengthSq() > 0 ? carried.normalize() : null;
};

const orthogonalUnit = (vector: Vector3, axis: Vector3) =>
  removeVector3ComponentAlongAxis(vector, axis).normalize();

export const readMapLibreCameraPose = (
  scene: MapLibreAnnotationScene
): EcefCameraPose | null => {
  const view = scene.getCameraSceneView();
  const positionECEF = view && scene.ecefFromScene(view.position);
  if (!view || !positionECEF) return null;
  const toEcef = (position: Vector3) => scene.ecefFromScene(position);
  const carry = (direction: Vector3) =>
    carryDirection(toEcef, view.position, positionECEF, direction);
  const directionECEF = carry(view.direction);
  const upECEF = carry(view.up);
  if (!directionECEF || !upECEF) return null;
  return {
    positionECEF,
    directionECEF,
    upECEF: orthogonalUnit(upECEF, directionECEF),
    verticalFovRad: degToRad(view.verticalFovDeg),
  };
};

export const applyMapLibreCameraPose = (
  map: MaplibreMap,
  scene: MapLibreAnnotationScene,
  pose: EcefCameraPose
): boolean => {
  const position = scene.sceneFromEcef(pose.positionECEF);
  const located = position && scene.lngLatAltitudeFromScene(position);
  if (!position || !located) return false;
  const toScene = (positionECEF: Vector3) => scene.sceneFromEcef(positionECEF);
  const carry = (direction: Vector3) =>
    carryDirection(toScene, pose.positionECEF, position, direction);
  const direction = carry(pose.directionECEF);
  const up = carry(pose.upECEF);
  const { lngLat, altitude } = located;
  const step = MAPLIBRE_CAMERA_POSE_DEFAULTS.tangentStepDegrees;
  const at = (lng: number, lat: number, alt: number) =>
    scene.sceneFromLngLatAltitude([lng, lat], alt);
  const base = at(lngLat[0], lngLat[1], altitude);
  const east = at(lngLat[0] + step, lngLat[1], altitude);
  const north = at(lngLat[0], lngLat[1] + step, altitude);
  const above = at(lngLat[0], lngLat[1], altitude + 1);
  if (!direction || !up || !base || !east || !north || !above) return false;
  const { bearing, pitch, roll } = readEnuViewAngles(
    direction,
    orthogonalUnit(up, direction),
    {
      east: east.sub(base).normalize(),
      north: north.sub(base).normalize(),
      up: above.sub(base).normalize(),
    }
  );
  const pitchDeg = radToDegNumeric(pitch);
  // the camera options depend on the field of view, so it goes first
  map.setVerticalFieldOfView(radToDegNumeric(pose.verticalFovRad));
  map.jumpTo(
    map.calculateCameraOptionsFromCameraLngLatAltRotation(
      lngLat,
      altitude,
      radToDegNumeric(bearing),
      pitchDeg,
      radToDegNumeric(roll)
    )
  );
  return pitchDeg <= map.getMaxPitch();
};
