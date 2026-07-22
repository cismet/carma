import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import * as THREE from "three";

export type EcefCoordinate = readonly [number, number, number];

/**
 * Matches Mesh 2024's ReorientationPlugin followed by the viewer's PI rotation:
 * scene X points east, Y up, and Z south at the selected ellipsoidal anchor.
 */
export const createEcefToSceneMatrix = (
  longitudeRadians: number,
  latitudeRadians: number,
  ellipsoidalHeight: number
) => {
  const ecefToPluginFrame = WGS84_ELLIPSOID.getObjectFrame(
    latitudeRadians,
    longitudeRadians,
    ellipsoidalHeight,
    0,
    0,
    0,
    new THREE.Matrix4()
  ).invert();
  return new THREE.Matrix4().makeRotationY(Math.PI).multiply(ecefToPluginFrame);
};

export const ecefToScenePosition = (
  ecef: EcefCoordinate,
  ecefToScene: THREE.Matrix4,
  target = new THREE.Vector3()
) => target.fromArray(ecef).applyMatrix4(ecefToScene);

export const sceneToEcefPosition = (
  scenePosition: THREE.Vector3,
  ecefToScene: THREE.Matrix4,
  target = new THREE.Vector3()
) => target.copy(scenePosition).applyMatrix4(ecefToScene.clone().invert());

export const ecefEllipsoidalHeight = (ecef: EcefCoordinate) =>
  WGS84_ELLIPSOID.getPositionElevation(new THREE.Vector3().fromArray(ecef));
