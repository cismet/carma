import * as THREE from "three";

import { clamp } from "@carma-commons/math";
import { SHADOW_SCENE_USER_DATA } from "../core/shadow-types";

const SHADOW_SIMULATION_SUN_VECTOR_NAME = "shadow-simulation-sun-vector";
const SUN_VECTOR_COLOR = 0xf59e0b;
const SUN_VECTOR_HEAD_LENGTH_FACTOR = 0.18;
const SUN_VECTOR_HEAD_WIDTH_FACTOR = 0.07;
const SUN_VECTOR_ANGLE_RADIUS_FACTOR = 0.22;
const SUN_VECTOR_ANGLE_SEGMENTS = 24;

export type SunVectorGizmo = Readonly<{
  root: THREE.ArrowHelper;
  /** Direction is unit length; visibility remains owned by the scene host. */
  update: (
    center: THREE.Vector3,
    direction: THREE.Vector3,
    length: number
  ) => void;
  dispose: () => void;
}>;

export const buildSunVector = (): SunVectorGizmo => {
  const helper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    1,
    SUN_VECTOR_COLOR
  );
  helper.name = SHADOW_SIMULATION_SUN_VECTOR_NAME;
  helper.visible = false;
  helper.frustumCulled = false;
  helper.line.visible = false;
  const overlayMaterial = new THREE.MeshBasicMaterial({
    color: SUN_VECTOR_COLOR,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
  });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 12),
    overlayMaterial
  );
  shaft.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-shaft`;
  shaft.matrixAutoUpdate = false;
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 8),
    overlayMaterial
  );
  origin.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-origin`;
  origin.matrixAutoUpdate = false;
  const lineMaterial = new THREE.LineBasicMaterial({
    color: SUN_VECTOR_COLOR,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
  });
  const groundRay = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
  groundRay.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-ground-ray`;
  const elevationArc = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
  elevationArc.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-elevation-arc`;
  helper.add(shaft, origin, groundRay, elevationArc);
  for (const part of [
    helper.line,
    helper.cone,
    shaft,
    origin,
    groundRay,
    elevationArc,
  ]) {
    part.userData[SHADOW_SCENE_USER_DATA.OVERLAY] = true;
    part.castShadow = false;
    part.receiveShadow = false;
    part.frustumCulled = false;
    part.renderOrder = 10_000;
    const material = part.material as THREE.Material;
    material.depthTest = false;
    material.depthWrite = false;
    material.toneMapped = false;
    material.transparent = true;
  }
  return {
    root: helper,
    update(center, normalizedDirection, vectorLength) {
      const headLength = vectorLength * SUN_VECTOR_HEAD_LENGTH_FACTOR;
      const shaftLength = vectorLength - headLength;
      helper.position.copy(center);
      helper.setDirection(normalizedDirection);
      helper.setLength(
        vectorLength,
        headLength,
        vectorLength * SUN_VECTOR_HEAD_WIDTH_FACTOR
      );
      shaft.position.set(0, shaftLength / 2, 0);
      shaft.scale.set(vectorLength * 0.006, shaftLength, vectorLength * 0.006);
      shaft.updateMatrix();
      origin.scale.setScalar(vectorLength * 0.012);
      origin.updateMatrix();
      const horizontalDirection = new THREE.Vector3(
        normalizedDirection.x,
        0,
        normalizedDirection.z
      );
      if (horizontalDirection.lengthSq() < Number.EPSILON) {
        horizontalDirection.set(0, 0, -1);
      } else {
        horizontalDirection.normalize();
      }
      const angleRadius = vectorLength * SUN_VECTOR_ANGLE_RADIUS_FACTOR;
      const inverseArrowRotation = helper.quaternion.clone().invert();
      groundRay.geometry.setFromPoints([
        new THREE.Vector3(),
        horizontalDirection
          .clone()
          .multiplyScalar(angleRadius)
          .applyQuaternion(inverseArrowRotation),
      ]);
      const elevationRadians = Math.asin(clamp(normalizedDirection.y, -1, 1));
      elevationArc.geometry.setFromPoints(
        Array.from({ length: SUN_VECTOR_ANGLE_SEGMENTS + 1 }, (_, index) => {
          const angle = (elevationRadians * index) / SUN_VECTOR_ANGLE_SEGMENTS;
          return horizontalDirection
            .clone()
            .multiplyScalar(Math.cos(angle) * angleRadius)
            .add(new THREE.Vector3(0, Math.sin(angle) * angleRadius, 0))
            .applyQuaternion(inverseArrowRotation);
        })
      );
      helper.updateMatrixWorld(true);
    },
    dispose: () => {
      helper.dispose();
      shaft.geometry.dispose();
      origin.geometry.dispose();
      overlayMaterial.dispose();
      groundRay.geometry.dispose();
      elevationArc.geometry.dispose();
      lineMaterial.dispose();
    },
  };
};
