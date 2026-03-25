import {
  BufferAttribute,
  Material,
  type BufferGeometry,
  type Mesh,
  type Vector3,
} from "three";

export const setQuadMeshGeometry = (
  mesh: Mesh,
  corners: readonly Vector3[] | null
): void => {
  const geometry = mesh.geometry as BufferGeometry;
  if (!corners || corners.length < 4) {
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(18), 3)
    );
    geometry.computeBoundingSphere();
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
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
};

export const disposeMeshObject = (mesh: Mesh): void => {
  mesh.removeFromParent();
  (mesh.geometry as BufferGeometry).dispose();
  (mesh.material as Material).dispose();
};
