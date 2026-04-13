import {
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  type BufferAttribute,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import {
  setCoplanarConvexPolygonMeshGeometry,
  setQuadMeshGeometry,
} from "./mesh-helpers";
const createTestMesh = () =>
  new Mesh(new BufferGeometry(), new MeshBasicMaterial());

const readAttributeCount = (mesh: Mesh, attributeName: string) =>
  (
    (mesh.geometry as BufferGeometry).getAttribute(attributeName) as
      | BufferAttribute
      | undefined
  )?.count ?? 0;

describe("mesh-helpers", () => {
  it("rebuilds normals when a quad returns from empty geometry", () => {
    const mesh = createTestMesh();
    const quad = [
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(1, 0, 1),
      new Vector3(-1, 0, 1),
    ] as const;

    setQuadMeshGeometry(mesh, null);
    expect(readAttributeCount(mesh, "position")).toBe(3);
    expect(readAttributeCount(mesh, "normal")).toBe(3);

    setQuadMeshGeometry(mesh, quad);
    expect(readAttributeCount(mesh, "position")).toBe(6);
    expect(readAttributeCount(mesh, "normal")).toBe(6);
  });

  it("keeps a stable coplanar normal when the polygon vertex count changes", () => {
    const mesh = createTestMesh();
    const triangle = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 0, 1),
    ] as const;
    const hexagon = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0, -0.1),
      new Vector3(1.4, 0, 0.5),
      new Vector3(1.1, 0, 1.2),
      new Vector3(0.3, 0, 1.4),
      new Vector3(-0.2, 0, 0.7),
    ] as const;
    const planeNormal = new Vector3(0, 1, 0);

    setCoplanarConvexPolygonMeshGeometry({
      mesh,
      polygon: triangle,
      planeNormal,
    });
    expect(readAttributeCount(mesh, "position")).toBe(3);
    expect(readAttributeCount(mesh, "normal")).toBe(3);

    setCoplanarConvexPolygonMeshGeometry({
      mesh,
      polygon: hexagon,
      planeNormal,
    });
    expect(readAttributeCount(mesh, "position")).toBe(12);
    expect(readAttributeCount(mesh, "normal")).toBe(12);

    const normals = (mesh.geometry as BufferGeometry).getAttribute(
      "normal"
    ) as BufferAttribute;

    for (let index = 0; index < normals.count; index += 1) {
      expect(normals.getX(index)).toBeCloseTo(0);
      expect(normals.getY(index)).toBeCloseTo(1);
      expect(normals.getZ(index)).toBeCloseTo(0);
    }
  });
});
