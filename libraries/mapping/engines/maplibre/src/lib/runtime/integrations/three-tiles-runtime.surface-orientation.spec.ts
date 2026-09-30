// @vitest-environment jsdom

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";

const MIB = 1024 ** 2;

type BytesRenderer = {
  calculateBytesUsed: (tile: unknown, scene: THREE.Object3D | null) => number;
};

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("surface orientation runtime integration", () => {
  it("orients connected LoD2 roof and wall triangles into outward shells", () => {
    const layer = buildThreeTilesRuntime(
      "lod2-city",
      "tileset.json",
      [7.15, 51.25],
      { shadowBuildingStyle: true }
    );
    const points = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const roofFaces = [[1, 2, 3]];
    const wallFaces = [
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
    ];
    const buildSurface = (faces: number[][]) => {
      const positions: number[] = [];
      const featureIds: number[] = [];
      for (const featureId of [0, 1]) {
        const offset = featureId * 3;
        for (const sourceFace of faces) {
          const face =
            featureId === 0
              ? sourceFace
              : [sourceFace[0], sourceFace[2], sourceFace[1]];
          for (const pointIndex of face) {
            const point = points[pointIndex];
            positions.push(point[0] + offset, point[1], point[2]);
            featureIds.push(featureId);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geometry.setAttribute(
        "_feature_id_0",
        new THREE.Float32BufferAttribute(featureIds, 1)
      );
      geometry.setIndex(
        Array.from({ length: positions.length / 3 }, (_, index) => index)
      );
      geometry.computeVertexNormals();
      return geometry;
    };
    const roofGeometry = buildSurface(roofFaces);
    const wallGeometry = buildSurface(wallFaces);
    const wallIndex = wallGeometry.getIndex();
    const second = wallIndex?.getX(1) ?? 0;
    wallIndex?.setX(1, wallIndex.getX(2));
    wallIndex?.setX(2, second);
    wallGeometry.computeVertexNormals();
    const roofMaterial = new THREE.MeshStandardMaterial({ name: "roof" });
    const wallMaterial = new THREE.MeshStandardMaterial({ name: "wall" });
    const cityTile = new THREE.Group();
    cityTile.add(
      new THREE.Mesh(roofGeometry, roofMaterial),
      new THREE.Mesh(wallGeometry, wallMaterial)
    );
    layer.scene.root.add(cityTile);

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });

    const edges = new Map<string, boolean[]>();
    const signedVolumes = new Map<number, number>();
    for (const geometry of [roofGeometry, wallGeometry]) {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const featureId = geometry.getAttribute("_feature_id_0");
      const index = geometry.getIndex();
      expect(index).not.toBeNull();
      for (let offset = 0; offset < (index?.count ?? 0); offset += 3) {
        const indices = [
          index?.getX(offset) ?? 0,
          index?.getX(offset + 1) ?? 0,
          index?.getX(offset + 2) ?? 0,
        ];
        const id = featureId.getX(indices[0]);
        const keys = indices.map(
          (vertex) =>
            `${position.getX(vertex)},${position.getY(vertex)},${position.getZ(
              vertex
            )}`
        );
        for (const [first, second] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ]) {
          const forward = keys[first] < keys[second];
          const edge = `${id}|${forward ? keys[first] : keys[second]}|${
            forward ? keys[second] : keys[first]
          }`;
          const directions = edges.get(edge) ?? [];
          directions.push(forward);
          edges.set(edge, directions);
        }
        const first = new THREE.Vector3().fromBufferAttribute(
          position,
          indices[0]
        );
        const second = new THREE.Vector3().fromBufferAttribute(
          position,
          indices[1]
        );
        const third = new THREE.Vector3().fromBufferAttribute(
          position,
          indices[2]
        );
        const faceNormal = new THREE.Vector3()
          .subVectors(second, first)
          .cross(new THREE.Vector3().subVectors(third, first));
        const vertexNormal = new THREE.Vector3().fromBufferAttribute(
          normal,
          indices[0]
        );
        expect(faceNormal.dot(vertexNormal)).toBeGreaterThan(0);
        signedVolumes.set(
          id,
          (signedVolumes.get(id) ?? 0) +
            first.dot(new THREE.Vector3().crossVectors(second, third)) / 6
        );
      }
    }
    expect(
      [...edges.values()].every((directions) => directions.length === 2)
    ).toBe(true);
    expect(
      [...edges.values()].every(([first, second]) => first !== second)
    ).toBe(true);
    expect([...signedVolumes.values()].every((volume) => volume > 0)).toBe(
      true
    );
    expect(roofMaterial.side).toBe(THREE.FrontSide);
    expect(wallMaterial.side).toBe(THREE.FrontSide);
    expect(roofMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(wallMaterial.shadowSide).toBe(THREE.DoubleSide);

    layer.scene.dispose();
  });
});
