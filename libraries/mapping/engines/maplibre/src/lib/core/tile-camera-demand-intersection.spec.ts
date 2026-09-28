import {
  Box3,
  Frustum,
  Matrix4,
  OrthographicCamera,
  Plane,
  Vector3,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
} from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "./tile-camera-demand";

// The unpruned plane-triple solver is an independent reference for the
// optimization: every box/frustum plane remains a constraint and candidate.
const unprunedVertices = (
  bounds: Box3,
  frustum: Frustum,
  transform?: Matrix4
): Vector3[] => {
  const origin = bounds.getCenter(new Vector3());
  const half = bounds.getSize(new Vector3()).multiplyScalar(0.5);
  const tolerance = Math.max(
    half.length() * 2e-9,
    Math.max(
      1,
      ...bounds.min.toArray().map(Math.abs),
      ...bounds.max.toArray().map(Math.abs)
    ) *
      Number.EPSILON *
      64
  );
  const inverse = transform?.clone().invert();
  const planes = [
    new Plane(new Vector3(1, 0, 0), half.x),
    new Plane(new Vector3(-1, 0, 0), half.x),
    new Plane(new Vector3(0, 1, 0), half.y),
    new Plane(new Vector3(0, -1, 0), half.y),
    new Plane(new Vector3(0, 0, 1), half.z),
    new Plane(new Vector3(0, 0, -1), half.z),
    ...frustum.planes.map((worldPlane) => {
      const plane = worldPlane.clone();
      if (inverse) plane.applyMatrix4(inverse);
      plane.constant += plane.normal.dot(origin);
      return plane;
    }),
  ];
  const vertices: Vector3[] = [];
  const bc = new Vector3();
  const ca = new Vector3();
  const ab = new Vector3();
  const point = new Vector3();
  for (let i = 0; i < planes.length - 2; i++)
    for (let j = i + 1; j < planes.length - 1; j++)
      for (let k = j + 1; k < planes.length; k++) {
        const a = planes[i];
        const b = planes[j];
        const c = planes[k];
        bc.crossVectors(b.normal, c.normal);
        const determinant = a.normal.dot(bc);
        if (Math.abs(determinant) <= 1e-12) continue;
        ca.crossVectors(c.normal, a.normal);
        ab.crossVectors(a.normal, b.normal);
        point
          .copy(bc)
          .multiplyScalar(-a.constant)
          .addScaledVector(ca, -b.constant)
          .addScaledVector(ab, -c.constant)
          .divideScalar(determinant);
        if (
          ![point.x, point.y, point.z].every(Number.isFinite) ||
          planes.some((plane) => plane.distanceToPoint(point) < -tolerance) ||
          vertices.some(
            (vertex) => vertex.distanceToSquared(point) <= tolerance * tolerance
          )
        )
          continue;
        vertices.push(point.clone());
      }
  return vertices.map((point) => {
    point.add(origin);
    return transform ? point.applyMatrix4(transform) : point;
  });
};

const orthographicDemand = () => {
  const camera = new OrthographicCamera(-5, 5, 5, -5, 2, 20);
  camera.position.z = 10;
  return createTileCameraDemand(
    snapshotTileCameraViews([
      {
        id: "sun",
        camera,
        viewport: [1000, 800],
        errorTargetPixels: 6,
        role: TILE_CAMERA_ROLE.GEOMETRY,
      },
    ])
  );
};

const cube = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));

describe("exact tile camera intersection fast paths", () => {
  it("uses real transformed corner witnesses for orthographic side, depth and touching cuts", () => {
    const demand = orthographicDemand();
    const intersections = vi.spyOn(demand, "intersectionVertices");
    for (const [x, y, z] of [
      [4.8, 0, 0],
      [0, 4.8, 0],
      [0, 0, 8],
      [0, 0, 9],
      [0, 0, -11],
    ]) {
      const transform = new Matrix4()
        .makeRotationZ(Math.PI / 4)
        .scale(new Vector3(-1, 0.5, 1))
        .setPosition(x, y, z);
      expect(
        unprunedVertices(cube, demand.views[0].frustum, transform).length
      ).toBeGreaterThan(0);
      expect(
        demand.evaluate(cube, 2, undefined, false, transform, true)
      ).toMatchObject({
        required: true,
        errorRatio: 200 / 6,
        contributions: [{ id: "sun", errorPixels: 200, visibleAreaPixels: 0 }],
      });
    }
    expect(intersections).not.toHaveBeenCalled();
  });

  it("still solves edge-only intersections and rejects oriented-box false positives", () => {
    const demand = orthographicDemand();
    const intersections = vi.spyOn(demand, "intersectionVertices");
    const enclosing = new Box3(
      new Vector3(-20, -20, -1),
      new Vector3(20, 20, 1)
    );
    expect(demand.evaluate(enclosing, 1).required).toBe(true);
    expect(intersections).toHaveBeenCalledTimes(1);
    const transform = new Matrix4()
      .makeRotationZ(Math.PI / 4)
      .setPosition(5.9, 5.9, 0);
    expect(
      demand.views[0].frustum.intersectsBox(
        cube.clone().applyMatrix4(transform)
      )
    ).toBe(true);
    expect(demand.evaluate(cube, 1, undefined, false, transform).required).toBe(
      false
    );
    expect(intersections).toHaveBeenCalledTimes(2);
  });

  it("matches the unpruned solver across projections, depth conventions, ECEF and transformed bounds", () => {
    let seed = 319;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (const coordinateSystem of [
      WebGLCoordinateSystem,
      WebGPUCoordinateSystem,
    ])
      for (const reversedDepth of [false, true])
        for (const orthographic of [false, true]) {
          const offset = reversedDepth ? 6_000_000 : 0;
          const position = new Vector3(offset + 7, 4, 10);
          const world = new Matrix4()
            .lookAt(position, new Vector3(offset, 0, 0), new Vector3(0, 1, 0))
            .setPosition(position);
          const projection = orthographic
            ? new Matrix4().makeOrthographic(
                -5,
                6,
                4,
                -3,
                1,
                25,
                coordinateSystem,
                reversedDepth
              )
            : new Matrix4().makePerspective(
                -1.3,
                0.7,
                0.8,
                -1.2,
                1,
                25,
                coordinateSystem,
                reversedDepth
              );
          const demand = createTileCameraDemand([
            {
              id: "parity",
              projectionMatrix: projection.toArray(),
              matrixWorld: world.toArray(),
              coordinateSystem,
              reversedDepth,
              viewport: [1440, 1000],
              errorTargetPixels: 6,
              role: TILE_CAMERA_ROLE.GEOMETRY,
            },
          ]);
          for (let index = 0; index < 48; index++) {
            const size = index === 0 ? 100 : 0.1 + random() * 8;
            const bounds = new Box3(
              new Vector3(-size, -size, -size),
              new Vector3(size, size, size)
            );
            const transform = new Matrix4()
              .makeRotationY(random() * Math.PI)
              .multiply(new Matrix4().makeRotationZ(random() * Math.PI))
              .scale(
                new Vector3(index % 2 ? -1 : 1, 0.3 + random(), 0.3 + random())
              )
              .setPosition(
                offset + (random() - 0.5) * 30,
                (random() - 0.5) * 30,
                (random() - 0.5) * 30
              );
            const reference = unprunedVertices(
              bounds,
              demand.views[0].frustum,
              transform
            );
            const actual = demand.intersectionVertices(
              bounds,
              "parity",
              transform
            );
            expect(
              actual.length,
              `projection=${orthographic}, reversed=${reversedDepth}, case=${index}`
            ).toBe(reference.length);
            for (const expected of reference)
              expect(
                actual.some((point) => point.distanceTo(expected) < 1e-7)
              ).toBe(true);
          }
        }
  });

  it("keeps tolerance-band and degenerate near/far intersections unchanged", () => {
    const demand = orthographicDemand();
    for (const x of [4, 5, 5 + 1e-10, 6, 6 + 1e-10])
      for (const z of [-11, -10, 8, 9, 9 + 1e-10])
        for (const halfDepth of [0, 1]) {
          const bounds = new Box3(
            new Vector3(x - 1, -1, z - halfDepth),
            new Vector3(x + 1, 1, z + halfDepth)
          );
          const reference = unprunedVertices(bounds, demand.views[0].frustum);
          const actual = demand.intersectionVertices(bounds, "sun");
          expect(actual.length).toBe(reference.length);
          for (const expected of reference)
            expect(
              actual.some((point) => point.distanceTo(expected) < 1e-10)
            ).toBe(true);
        }
  });
});
