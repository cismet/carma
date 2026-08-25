import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildExtrusionMeshes } from "./ExtrusionFactory";

const counterClockwiseRing = [
  [7.2, 51.2],
  [7.2002, 51.2],
  [7.2002, 51.2002],
  [7.2, 51.2002],
];

const getFaceNormal = (
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 => {
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex();
  if (!indices) throw new Error("Expected indexed extrusion geometry");
  const offset = faceIndex * 3;
  const a = new THREE.Vector3().fromBufferAttribute(
    positions,
    indices.getX(offset)
  );
  const b = new THREE.Vector3().fromBufferAttribute(
    positions,
    indices.getX(offset + 1)
  );
  const c = new THREE.Vector3().fromBufferAttribute(
    positions,
    indices.getX(offset + 2)
  );
  return b.sub(a).cross(c.sub(a)).normalize();
};

describe("buildExtrusionMeshes", () => {
  it.each([
    ["counter-clockwise", counterClockwiseRing],
    ["clockwise", [...counterClockwiseRing].reverse()],
  ])("builds outward, single-sided faces from a %s ring", (_label, ring) => {
    const scene = new THREE.Scene();
    const origin = MercatorCoordinate.fromLngLat([7.2, 51.2], 0);
    buildExtrusionMeshes(
      [
        {
          ring,
          height: 12,
          elevation: 150,
          isPublic: false,
          sourceIndex: 0,
        },
      ],
      scene,
      origin,
      origin.meterInMercatorCoordinateUnits()
    );

    const wall = scene.children.find(
      (child) => (child as THREE.Mesh).userData.isBuildingWall
    ) as THREE.Mesh;
    const roof = scene.children.find(
      (child) =>
        (child as THREE.Mesh).userData.isBuilding &&
        !(child as THREE.Mesh).userData.isBuildingWall
    ) as THREE.Mesh;

    expect((wall.material as THREE.Material).side).toBe(THREE.FrontSide);
    expect((roof.material as THREE.Material).side).toBe(THREE.FrontSide);

    const roofIndex = roof.geometry.getIndex();
    expect(roofIndex).not.toBeNull();
    const capFaceCount = (roofIndex?.count ?? 0) / 3;
    expect(capFaceCount).toBe(4);
    for (let face = 0; face < capFaceCount / 2; face += 1) {
      expect(getFaceNormal(roof.geometry, face).y).toBeGreaterThan(0.999);
    }
    for (let face = capFaceCount / 2; face < capFaceCount; face += 1) {
      expect(getFaceNormal(roof.geometry, face).y).toBeLessThan(-0.999);
    }
    const roofNormals = roof.geometry.getAttribute("normal");
    expect(roofNormals.getY(0)).toBe(1);
    expect(roofNormals.getY(roofNormals.count - 1)).toBe(-1);

    const wallPositions = wall.geometry.getAttribute("position");
    const center = new THREE.Vector3();
    for (let index = 0; index < wallPositions.count; index += 1) {
      center.add(new THREE.Vector3().fromBufferAttribute(wallPositions, index));
    }
    center.divideScalar(wallPositions.count);
    const wallIndex = wall.geometry.getIndex();
    expect(wallIndex).not.toBeNull();
    for (let edge = 0; edge < wallPositions.count / 4; edge += 1) {
      const edgeBase = edge * 4;
      const edgeMidpoint = new THREE.Vector3()
        .fromBufferAttribute(wallPositions, edgeBase)
        .add(
          new THREE.Vector3().fromBufferAttribute(wallPositions, edgeBase + 1)
        )
        .multiplyScalar(0.5);
      const outward = edgeMidpoint.sub(center).setY(0).normalize();
      for (const face of [edge * 2, edge * 2 + 1]) {
        expect(getFaceNormal(wall.geometry, face).dot(outward)).toBeGreaterThan(
          0.999
        );
      }
    }
  });
});
