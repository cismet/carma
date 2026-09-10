import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";

import {
  computeMeshVertexNormals,
  setCoplanarConvexPolygonMeshGeometry,
  setQuadMeshGeometry,
} from "./mesh-helpers";

const expectThreeNormalParity = (geometry: BufferGeometry) => {
  const reference = geometry.clone();
  reference.computeVertexNormals();
  computeMeshVertexNormals(geometry);
  expect(geometry.getAttribute("normal").array).toEqual(
    reference.getAttribute("normal").array
  );
  reference.dispose();
};

describe("computeMeshVertexNormals", () => {
  it.each([Uint16Array, Uint32Array])(
    "matches Three on irregular indexed faces with %s",
    (IndexArray) => {
      const geometry = new BufferGeometry();
      const positions = new Float32Array(25 * 3);
      for (let index = 0; index < 25; index += 1) {
        const x = index % 5;
        const y = Math.floor(index / 5);
        positions.set(
          [x * 0.7, Math.sin(x) * Math.cos(y) * 23, y * 1.3],
          index * 3
        );
      }
      const indices = [];
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const index = y * 5 + x;
          indices.push(
            index,
            index + 5,
            index + 1,
            index + 1,
            index + 5,
            index + 6
          );
        }
      }
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setIndex(new BufferAttribute(new IndexArray(indices), 1));
      const generic = vi.spyOn(geometry, "computeVertexNormals");
      expectThreeNormalParity(geometry);
      expect(generic).not.toHaveBeenCalled();
      geometry.dispose();
    }
  );

  it("reuses the normal buffer and clears previous accumulation after height changes", () => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const normals = new Float32Array(9).fill(17);
    const normal = new BufferAttribute(normals, 3);
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("normal", normal);
    geometry.setIndex([0, 2, 1]);
    expectThreeNormalParity(geometry);
    const version = normal.version;
    positions[4] = 3;
    expectThreeNormalParity(geometry);
    expect(geometry.getAttribute("normal")).toBe(normal);
    expect(normal.array).toBe(normals);
    expect(normal.version).toBe(version + 1);
    geometry.dispose();
  });

  it("preserves zero normals for degenerate faces and unused vertices", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(12), 3)
    );
    geometry.setIndex([0, 1, 2, 0, 0, 0]);
    expectThreeNormalParity(geometry);
    expect([...geometry.getAttribute("normal").array]).toEqual(
      Array(12).fill(0)
    );
    geometry.dispose();
  });

  it("keeps 32-bit vertex indices and original winding", () => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(65_538 * 3);
    positions.set([1, 3, 0, 0, 0, 1], 65_536 * 3);
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setIndex(
      new BufferAttribute(new Uint32Array([0, 65_536, 65_537]), 1)
    );
    expectThreeNormalParity(geometry);
    expect(geometry.getAttribute("normal").getY(0)).toBeLessThan(0);
    geometry.dispose();
  });

  it("delegates non-indexed geometry to Three", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)
    );
    const generic = vi.spyOn(geometry, "computeVertexNormals");
    expectThreeNormalParity(geometry);
    expect(generic).toHaveBeenCalledOnce();
    geometry.dispose();
  });

  it("delegates interleaved positions to Three", () => {
    const geometry = new BufferGeometry();
    const data = new InterleavedBuffer(
      new Float32Array([0, 0, 0, 99, 1, 0, 0, 99, 0, 1, 0, 99]),
      4
    );
    geometry.setAttribute(
      "position",
      new InterleavedBufferAttribute(data, 3, 0)
    );
    geometry.setIndex([0, 1, 2]);
    const generic = vi.spyOn(geometry, "computeVertexNormals");
    expectThreeNormalParity(geometry);
    expect(generic).toHaveBeenCalledOnce();
    geometry.dispose();
  });

  it("preserves normalized integer attribute semantics via Three", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Uint16Array([0, 0, 0, 65535, 0, 0, 0, 65535, 0]),
        3,
        true
      )
    );
    geometry.setAttribute(
      "normal",
      new BufferAttribute(new Int16Array(9), 3, true)
    );
    geometry.setIndex([0, 1, 2]);
    const generic = vi.spyOn(geometry, "computeVertexNormals");
    expectThreeNormalParity(geometry);
    expect(generic).toHaveBeenCalledOnce();
    geometry.dispose();
  });
});

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
