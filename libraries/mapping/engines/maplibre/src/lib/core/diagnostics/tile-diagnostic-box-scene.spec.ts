import { Matrix4, PerspectiveCamera, OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  TILE_CAMERA_ROLE,
  type TileCameraSnapshot,
} from "../tile-camera-demand";
import type { DiagnosticViewportBasis } from "./tile-diagnostic-model";
import { buildDiagnosticBoxScene } from "./tile-diagnostic-box-scene";
import {
  PRIMITIVE_FLOATS,
  TILE_KINDS,
  TILE_STEP_SLOTS,
  type DiagnosticSnapshot,
} from "./tile-diagnostic-scene";

const fixture = (transform = new Matrix4()) => {
  const basis: DiagnosticViewportBasis = {
    rectBounds: [0, 0, 0, 2, 1, 3],
    rectTransforms: transform.toArray(),
    bounds: [0, 0, 0, 2, 1, 3],
    worldToOverview: new Matrix4().toArray(),
    screen: [10, 0, 0],
    width: 200,
    height: 200,
  };
  const snapshot: DiagnosticSnapshot = {
    tiles: new Float32Array([
      0,
      0,
      20,
      30,
      TILE_KINDS.indexOf("displayed"),
      32,
      1,
      1,
      3,
      2,
      200 * 1024,
      ...Array.from({ length: TILE_STEP_SLOTS }, (_, i) => (i === 3 ? 100 : 0)),
      0,
    ]),
    ids: ["tile"],
    extent: null,
    edges: new Float32Array(),
    center: null,
    target: 2,
    viewportBasis: basis,
  };
  return { snapshot, basis };
};
const rows = (data: Float32Array) =>
  Array.from({ length: data.length / PRIMITIVE_FLOATS }, (_, i) =>
    Array.from(data.subarray(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS))
  );

describe("diagnostic box scene", () => {
  it("draws six true faces and twelve unique edges with all source marks on the upper face once", () => {
    const { snapshot, basis } = fixture();
    const scene = buildDiagnosticBoxScene(snapshot, basis);
    const primitives = rows(scene.primitives);
    expect(primitives.filter((p) => p[4] === 0 && p[5] === 0)).toHaveLength(6);
    expect(primitives.filter((p) => p[4] === 3)).toHaveLength(12);
    expect(primitives.filter((p) => p[4] === 6)).toHaveLength(1);
    expect(primitives.filter((p) => p[4] === 0 && p[5] > 0)).toHaveLength(20);
    expect(scene.planes.length).toBe(primitives.length * 12);
    expect(scene.edgeRanges.get(0)).toEqual({ start: 6, count: 12 });
    const uniqueEdges = new Set(
      primitives
        .filter((p) => p[4] === 3)
        .map((p, i) => {
          const plane = Array.from(
            scene.planes.subarray((i + 6) * 12, (i + 7) * 12)
          );
          const first = plane.slice(0, 3);
          const last = first.map(
            (value, axis) => value + plane[4 + axis] * p[2]
          );
          return [first.join(","), last.join(",")].sort().join(";");
        })
    );
    expect(uniqueEdges.size).toBe(12);
    expect(scene.labelFaces[0]).toMatchObject({
      width: 20,
      height: 30,
      depth: -10,
      transform: [1, 0, 0, 1, 0, 0],
    });
    expect(scene.depthRange[0]).toBeCloseTo(-10, 6);
    expect(scene.depthRange[1]).toBeCloseTo(0, 6);
    expect(scene.legend.find(({ id }) => id === "bytes")?.label).toBe(
      "1 cell = 10 KiB"
    );
    const faces = primitives.filter((p) => p[4] === 0 && p[5] === 0);
    expect(1 - (1 - faces[0][15]) ** 2).toBeCloseTo(0.3, 6);
  });

  it("keeps reflected boxes native and prefers ENU-up when two observer-facing faces tie", () => {
    const transform = new Matrix4().makeScale(-1, 1, 1).setPosition(5, 0, 0);
    const { snapshot, basis } = fixture(transform);
    const active = {
      ...basis,
      worldToOverview: new Matrix4().makeRotationX(-Math.PI / 4).toArray(),
    };
    const scene = buildDiagnosticBoxScene(snapshot, active);
    expect(scene.labelFaces).toHaveLength(1);
    expect(scene.labelFaces[0].transform[0]).toBeGreaterThan(0);
    expect(scene.labelFaces[0].transform[3]).toBeGreaterThan(0);
    const mark = rows(scene.primitives).findIndex((p) => p[4] === 6);
    const plane = Array.from(scene.planes.subarray(mark * 12, (mark + 1) * 12));
    const point = new Vector3(
      plane[0] / 10,
      -plane[2] / 10,
      plane[1] / 10
    ).applyMatrix4(new Matrix4().fromArray(active.worldToOverview).invert());
    expect(point.y).toBeCloseTo(1, 6);
    expect(scene.edgeRanges.get(0)?.count).toBe(12);
    expect([...scene.primitives, ...scene.planes].every(Number.isFinite)).toBe(
      true
    );
  });

  it("preserves projective W, skips invalid bounds, and keeps flat fallback labels translated", () => {
    const camera = new PerspectiveCamera(60, 1, 1, 100);
    camera.position.set(0, 5, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const observer: TileCameraSnapshot = {
      id: "observer",
      projectionMatrix: camera.projectionMatrix.toArray(),
      matrixWorld: camera.matrixWorld.toArray(),
      coordinateSystem: camera.coordinateSystem,
      reversedDepth: false,
      viewport: [200, 200],
      errorTargetPixels: 2,
      role: TILE_CAMERA_ROLE.RECEIVER,
    };
    const { snapshot, basis } = fixture();
    const projective = new Matrix4()
      .set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1)
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    const scene = buildDiagnosticBoxScene(
      snapshot,
      {
        ...basis,
        worldToOverview: projective.toArray(),
        screen: [100, 100, 100, -100],
      },
      observer
    );
    expect(scene.depthRange).toEqual([-1, 1]);
    expect(
      Array.from(scene.planes)
        .filter((_, i) => i % 12 === 7 || i % 12 === 11)
        .some((w) => Math.abs(w) > 1e-8)
    ).toBe(true);
    expect([...scene.primitives, ...scene.planes].every(Number.isFinite)).toBe(
      true
    );
    const orthographic = new OrthographicCamera(-5, 5, 5, -5, 1, 100);
    orthographic.position.copy(camera.position);
    orthographic.lookAt(0, 0, 0);
    orthographic.updateMatrixWorld();
    const cameraBasis = {
      ...basis,
      worldToOverview: new Matrix4()
        .set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1)
        .multiply(orthographic.projectionMatrix)
        .multiply(orthographic.matrixWorldInverse)
        .toArray(),
      cameraProjection: { reversedDepth: false },
      screen: [100, 100, 100, -100],
    };
    const ortho = buildDiagnosticBoxScene(snapshot, cameraBasis, {
      ...observer,
      matrixWorld: orthographic.matrixWorld.toArray(),
      projectionMatrix: orthographic.projectionMatrix.toArray(),
    });
    const reversed = buildDiagnosticBoxScene(
      snapshot,
      { ...cameraBasis, cameraProjection: { reversedDepth: true } },
      observer
    );
    expect(ortho.depthRange).toEqual([-1, 1]);
    expect(reversed.depthRange).toEqual([-1, 1]);
    const normalDepth = ortho.planes[2];
    expect(Math.abs(normalDepth)).toBeLessThan(1);
    expect(reversed.planes[2]).toBeCloseTo(-normalDepth, 6);
    const invalid = buildDiagnosticBoxScene(snapshot, {
      ...basis,
      rectBounds: [NaN, 0, 0, 2, 1, 3],
    });
    expect(invalid.primitives).toHaveLength(0);
    expect(invalid.legend).toEqual([]);
    snapshot.tiles[0] = 42;
    snapshot.tiles[1] = 17;
    const fallback = buildDiagnosticBoxScene(snapshot, {
      ...basis,
      rectBounds: undefined,
    });
    expect(fallback.labelFaces[0].transform).toEqual([1, 0, 0, 1, 42, 17]);
    expect(
      Array.from(fallback.annotationSnapshot.tiles.subarray(0, 2))
    ).toEqual([0, 0]);
  });
});
