import {
  BufferAttribute,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
} from "three";
import { hasDefaultMaterialShader } from "./shaders";

/** Unsupported draw features retain their original rendering representation. */
export const supportsTerrainInstanceTransform = (matrix: Matrix4): boolean => {
  const e = matrix.elements;
  const x = Math.hypot(e[0], e[1], e[2]);
  const y = Math.hypot(e[4], e[5], e[6]);
  const z = Math.hypot(e[8], e[9], e[10]);
  if (
    ![x, y, z].every((value) => Number.isFinite(value) && value > 0) ||
    matrix.determinant() <= 0
  )
    return false;
  return (
    Math.abs((e[0] * e[4] + e[1] * e[5] + e[2] * e[6]) / (x * y)) < 1e-7 &&
    Math.abs((e[0] * e[8] + e[1] * e[9] + e[2] * e[10]) / (x * z)) < 1e-7 &&
    Math.abs((e[4] * e[8] + e[5] * e[9] + e[6] * e[10]) / (y * z)) < 1e-7
  );
};
export const canInstanceTerrainMesh = (mesh: Mesh): boolean => {
  const { geometry, material } = mesh;
  if (
    mesh.type !== "Mesh" ||
    !supportsTerrainInstanceTransform(mesh.matrixWorld) ||
    Array.isArray(material) ||
    !(
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhongMaterial ||
      material instanceof MeshLambertMaterial ||
      material instanceof MeshBasicMaterial
    ) ||
    ![
      "MeshStandardMaterial",
      "MeshPhongMaterial",
      "MeshLambertMaterial",
      "MeshBasicMaterial",
    ].includes(material.type) ||
    !hasDefaultMaterialShader(material) ||
    mesh.customDepthMaterial ||
    mesh.customDistanceMaterial ||
    mesh.morphTargetInfluences?.length ||
    Object.keys(geometry.morphAttributes).length ||
    geometry.groups.length ||
    geometry.drawRange.start !== 0 ||
    (geometry.drawRange.count !== Infinity &&
      geometry.drawRange.count !== geometry.index?.count) ||
    material.vertexColors ||
    ("displacementMap" in material && material.displacementMap) ||
    ("flatShading" in material && material.flatShading) ||
    ("normalMap" in material && material.normalMap) ||
    ("bumpMap" in material && material.bumpMap) ||
    material.alphaHash ||
    material.transparent ||
    material.alphaToCoverage ||
    material.onBeforeRender !== Material.prototype.onBeforeRender ||
    mesh.onBeforeRender !== Mesh.prototype.onBeforeRender ||
    mesh.onAfterRender !== Mesh.prototype.onAfterRender ||
    mesh.onBeforeShadow !== Mesh.prototype.onBeforeShadow ||
    mesh.onAfterShadow !== Mesh.prototype.onAfterShadow
  )
    return false;
  if (
    Object.keys(geometry.attributes).some(
      (key) => !["position", "normal", "uv"].includes(key)
    )
  ) {
    return false;
  }
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (
    !(position instanceof BufferAttribute) ||
    !(normal instanceof BufferAttribute) ||
    !(position.array instanceof Float32Array) ||
    !(normal.array instanceof Float32Array) ||
    position.itemSize !== 3 ||
    normal.itemSize !== 3 ||
    position.normalized ||
    normal.normalized ||
    position.count !== normal.count ||
    !geometry.index ||
    !(
      geometry.index.array instanceof Uint16Array ||
      geometry.index.array instanceof Uint32Array
    )
  )
    return false;
  const uv = geometry.getAttribute("uv");
  return (
    !uv ||
    (uv instanceof BufferAttribute &&
      uv.itemSize === 2 &&
      uv.array instanceof Float32Array &&
      !uv.normalized &&
      uv.count === position.count)
  );
};

export const sameTerrainTopology = (left: Mesh, right: Mesh): boolean => {
  const a = left.geometry;
  const b = right.geometry;
  if (a === b) return true;
  if (a.getAttribute("position").count !== b.getAttribute("position").count)
    return false;
  for (const [first, second] of [
    [a.index, b.index],
    [a.getAttribute("uv"), b.getAttribute("uv")],
  ]) {
    if (!first || !second) {
      if (first !== second) return false;
      continue;
    }
    if (
      !(first instanceof BufferAttribute) ||
      !(second instanceof BufferAttribute)
    )
      return false;
    if (
      first.array.constructor !== second.array.constructor ||
      first.array.length !== second.array.length
    )
      return false;
    const firstBits = new Uint8Array(
      first.array.buffer,
      first.array.byteOffset,
      first.array.byteLength
    );
    const secondBits = new Uint8Array(
      second.array.buffer,
      second.array.byteOffset,
      second.array.byteLength
    );
    for (let index = 0; index < firstBits.length; index += 1) {
      if (firstBits[index] !== secondBits[index]) return false;
    }
  }
  return true;
};
