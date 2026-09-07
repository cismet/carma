import {
  BufferAttribute,
  Material,
  type BufferGeometry,
  type Mesh,
  type Vector3,
} from "three";
import { tryComputeMeshVertexNormalsWasm } from "./mesh-normals-wasm";

/** Three-compatible area-weighted normals, specialized for packed indexed meshes. */
export const computeMeshVertexNormals = (geometry: BufferGeometry): void => {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  let normal = geometry.getAttribute("normal");
  if (
    !(position instanceof BufferAttribute) ||
    !(position.array instanceof Float32Array) ||
    position.itemSize !== 3 ||
    position.normalized ||
    !index ||
    !(
      index.array instanceof Uint16Array || index.array instanceof Uint32Array
    ) ||
    index.itemSize !== 1 ||
    index.normalized ||
    (normal &&
      (!(normal instanceof BufferAttribute) ||
        !(normal.array instanceof Float32Array) ||
        normal.itemSize !== 3 ||
        normal.normalized ||
        normal.count !== position.count))
  ) {
    geometry.computeVertexNormals();
    return;
  }

  const positions = position.array;
  const indices = index.array;
  if (!normal) {
    normal = new BufferAttribute(new Float32Array(positions.length), 3);
    geometry.setAttribute("normal", normal);
  }
  const normals = normal.array as Float32Array;
  if (tryComputeMeshVertexNormalsWasm(positions, indices, normals)) {
    normal.needsUpdate = true;
    return;
  }
  normals.fill(0);
  // Preserve Three's cross-product order and Float32 rounding after each face;
  // summing in double precision until the end changes stitched vertex normals.
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 3;
    const b = indices[offset + 1] * 3;
    const c = indices[offset + 2] * 3;
    const cbX = positions[c] - positions[b];
    const cbY = positions[c + 1] - positions[b + 1];
    const cbZ = positions[c + 2] - positions[b + 2];
    const abX = positions[a] - positions[b];
    const abY = positions[a + 1] - positions[b + 1];
    const abZ = positions[a + 2] - positions[b + 2];
    const normalX = cbY * abZ - cbZ * abY;
    const normalY = cbZ * abX - cbX * abZ;
    const normalZ = cbX * abY - cbY * abX;
    normals[a] += normalX;
    normals[a + 1] += normalY;
    normals[a + 2] += normalZ;
    normals[b] += normalX;
    normals[b + 1] += normalY;
    normals[b + 2] += normalZ;
    normals[c] += normalX;
    normals[c + 1] += normalY;
    normals[c + 2] += normalZ;
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const x = normals[offset];
    const y = normals[offset + 1];
    const z = normals[offset + 2];
    const inverseLength = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    normals[offset] = x * inverseLength;
    normals[offset + 1] = y * inverseLength;
    normals[offset + 2] = z * inverseLength;
  }
  normal.needsUpdate = true;
};

const buildRepeatedNormalAttribute = (
  normal: Vector3,
  vertexCount: number
): Float32Array => {
  const normalLengthSq = normal.lengthSq();
  const resolvedNormal =
    normalLengthSq > 0
      ? normal.clone().normalize()
      : {
          x: 0,
          y: 1,
          z: 0,
        };
  const normals = new Float32Array(vertexCount * 3);

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const baseOffset = vertexIndex * 3;
    normals[baseOffset] = resolvedNormal.x;
    normals[baseOffset + 1] = resolvedNormal.y;
    normals[baseOffset + 2] = resolvedNormal.z;
  }

  return normals;
};

const setEmptyMeshGeometry = (geometry: BufferGeometry): void => {
  geometry.setIndex(null);
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(9), 3)
  );
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(9), 3));
  geometry.setDrawRange(0, 0);
  geometry.computeBoundingSphere();
};

export const setQuadMeshGeometry = (
  mesh: Mesh,
  corners: readonly Vector3[] | null
): void => {
  const geometry = mesh.geometry as BufferGeometry;
  if (!corners || corners.length < 4) {
    setEmptyMeshGeometry(geometry);
    return;
  }

  const positions = new Float32Array([
    corners[0].x,
    corners[0].y,
    corners[0].z,
    corners[1].x,
    corners[1].y,
    corners[1].z,
    corners[2].x,
    corners[2].y,
    corners[2].z,
    corners[0].x,
    corners[0].y,
    corners[0].z,
    corners[2].x,
    corners[2].y,
    corners[2].z,
    corners[3].x,
    corners[3].y,
    corners[3].z,
  ]);
  geometry.setIndex(null);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  geometry.setDrawRange(0, positions.length / 3);
  geometry.computeBoundingSphere();
};

export const setCoplanarConvexPolygonMeshGeometry = ({
  mesh,
  polygon,
  planeNormal,
}: {
  mesh: Mesh;
  polygon: readonly Vector3[] | null;
  planeNormal: Vector3;
}): void => {
  const geometry = mesh.geometry as BufferGeometry;
  if (!polygon || polygon.length < 3) {
    setEmptyMeshGeometry(geometry);
    return;
  }

  const triangleCount = polygon.length - 2;
  const positions = new Float32Array(triangleCount * 9);

  for (
    let triangleIndex = 0;
    triangleIndex < triangleCount;
    triangleIndex += 1
  ) {
    const points = [
      polygon[0]!,
      polygon[triangleIndex + 1]!,
      polygon[triangleIndex + 2]!,
    ];
    points.forEach((point, pointIndex) => {
      const baseOffset = triangleIndex * 9 + pointIndex * 3;
      positions[baseOffset] = point.x;
      positions[baseOffset + 1] = point.y;
      positions[baseOffset + 2] = point.z;
    });
  }

  geometry.setIndex(null);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute(
    "normal",
    new BufferAttribute(
      buildRepeatedNormalAttribute(planeNormal, positions.length / 3),
      3
    )
  );
  geometry.setDrawRange(0, positions.length / 3);
  geometry.computeBoundingSphere();
};

export const disposeMeshObject = (mesh: Mesh): void => {
  mesh.removeFromParent();
  (mesh.geometry as BufferGeometry).dispose();
  (mesh.material as Material).dispose();
};
