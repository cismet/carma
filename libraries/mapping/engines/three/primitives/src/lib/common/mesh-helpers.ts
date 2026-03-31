import {
  BufferAttribute,
  Material,
  type BufferGeometry,
  type Mesh,
  type Vector3,
} from "three";

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
