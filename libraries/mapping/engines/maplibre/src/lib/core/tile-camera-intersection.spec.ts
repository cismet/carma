import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
} from "./tile-camera-demand";
import {
  perspective,
  orthographic,
  box,
} from "./tile-camera-demand.test-support";

describe("tile camera intersection", () => {
  describe("intersection vertices", () => {
    it("returns all eight box corners when the box is inside the view", () => {
      const demand = createTileCameraDemand(
        snapshotTileCameraViews([perspective("main")])
      );
      const vertices = demand.intersectionVertices(box(0));

      expect(vertices).toHaveLength(8);
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1])
            expect(
              vertices.some((point) => point.equals(new Vector3(x, y, z)))
            ).toBe(true);
    });

    it("preserves transformed corners for a contained rotated and scaled box", () => {
      const demand = createTileCameraDemand(
        snapshotTileCameraViews([perspective("main")])
      );
      const bounds = box(0);
      const transform = new Matrix4()
        .makeRotationY(Math.PI / 4)
        .scale(new Vector3(1, 0.5, 1.5))
        .setPosition(1, 0, -2);
      const before = transform.clone();
      const vertices = demand.intersectionVertices(bounds, "main", transform);
      expect(vertices).toHaveLength(8);
      expect(new Set(vertices).size).toBe(8);
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) {
            const expected = new Vector3(x, y, z).applyMatrix4(transform);
            expect(
              vertices.some((point) => point.distanceTo(expected) < 1e-12)
            ).toBe(true);
          }
      const fresh = demand.intersectionVertices(bounds, "main", transform);
      vertices[0].set(1000, 1000, 1000);
      expect(fresh).toEqual(
        demand.intersectionVertices(bounds, "main", transform)
      );
      expect(transform).toEqual(before);
    });

    it("keeps partial-camera vertices beside a containing view and honors camera selection", () => {
      const demand = createTileCameraDemand(
        snapshotTileCameraViews([
          orthographic("inside"),
          orthographic("partial", 5.5),
          orthographic("same-inside"),
        ])
      );
      const bounds = box(0);
      expect(demand.intersectionVertices(bounds, "inside")).toHaveLength(8);
      expect(demand.intersectionVertices(bounds, "missing")).toEqual([]);
      const partial = demand.intersectionVertices(bounds, "partial");
      expect(partial).toHaveLength(8);
      expect(new Box3().setFromPoints(partial).min.x).toBeCloseTo(0.5);
      const union = demand.intersectionVertices(bounds);
      expect(union).toHaveLength(12);
      expect(union.filter(({ x }) => Math.abs(x - 0.5) < 1e-12)).toHaveLength(
        4
      );
    });

    it("clips a rotated box crossing an orthographic side without returning its exterior corner", () => {
      const demand = createTileCameraDemand(
        snapshotTileCameraViews([orthographic("main")])
      );
      const transform = new Matrix4()
        .makeRotationZ(Math.PI / 4)
        .setPosition(4.8, 0, 0);
      const vertices = demand.intersectionVertices(box(0), "main", transform);
      expect(vertices).toHaveLength(10);
      expect(Math.max(...vertices.map(({ x }) => x))).toBeCloseTo(5);
      expect(vertices.filter(({ x }) => Math.abs(x - 5) < 1e-12)).toHaveLength(
        4
      );
      const inverse = transform.clone().invert();
      for (const vertex of vertices)
        expect(
          box(0)
            .expandByScalar(1e-12)
            .containsPoint(vertex.clone().applyMatrix4(inverse))
        ).toBe(true);
    });

    it("returns no vertices for empty, non-finite or disjoint bounds", () => {
      const demand = createTileCameraDemand(
        snapshotTileCameraViews([perspective("main")])
      );

      expect(demand.intersectionVertices(new Box3())).toEqual([]);
      expect(demand.intersectionVertices(box(100, 100))).toEqual([]);
      expect(
        demand.intersectionVertices(
          new Box3(new Vector3(-Infinity, -1, -1), new Vector3(1, 1, 1))
        )
      ).toEqual([]);
      expect(createTileCameraDemand([]).intersectionVertices(box(0))).toEqual(
        []
      );
    });

    it("clips a partial box to the actual orthographic side plane", () => {
      const demand = createTileCameraDemand(
        snapshotTileCameraViews([orthographic("main")])
      );
      const vertices = demand.intersectionVertices(
        new Box3(new Vector3(3, -1, -1), new Vector3(6, 1, 1))
      );

      expect(vertices).toHaveLength(8);
      expect(new Box3().setFromPoints(vertices)).toEqual(
        new Box3(new Vector3(3, -1, -1), new Vector3(5, 1, 1))
      );
    });

    it("clips against a tilted, off-axis perspective volume rather than a horizontal plane", () => {
      const view = perspective("tilted");
      view.camera.position.set(7, 4, 10);
      view.camera.lookAt(-1, 0, -3);
      view.camera.near = 2;
      view.camera.far = 20;
      view.camera.setViewOffset(1000, 800, 200, 100, 600, 500);
      view.camera.updateProjectionMatrix();
      const demand = createTileCameraDemand(snapshotTileCameraViews([view]));
      const bounds = new Box3(new Vector3(-5, -4, -5), new Vector3(5, 4, 5));
      const vertices = demand.intersectionVertices(bounds);

      expect(vertices.length).toBeGreaterThanOrEqual(8);
      expect(
        vertices.some(
          ({ x, y, z }) =>
            Math.abs(x) < 5 - 1e-7 ||
            Math.abs(y) < 4 - 1e-7 ||
            Math.abs(z) < 5 - 1e-7
        )
      ).toBe(true);
      for (const vertex of vertices) {
        expect(bounds.clone().expandByScalar(1e-7).containsPoint(vertex)).toBe(
          true
        );
        const clip = vertex.clone().project(view.camera);
        expect(
          Math.max(Math.abs(clip.x), Math.abs(clip.y), Math.abs(clip.z))
        ).toBeLessThanOrEqual(1 + 1e-7);
      }
      expect(
        Math.max(...vertices.map(({ z }) => z)) -
          Math.min(...vertices.map(({ z }) => z))
      ).toBeGreaterThan(1);
    });

    it("returns the frustum's near and far vertices when bounds enclose it", () => {
      const view = perspective("enclosed");
      view.camera.far = 20;
      view.camera.updateProjectionMatrix();
      const demand = createTileCameraDemand(snapshotTileCameraViews([view]));
      const vertices = demand.intersectionVertices(box(0, 0, 0, 100));

      expect(vertices).toHaveLength(8);
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) {
            const expected = new Vector3(x, y, z).unproject(view.camera);
            expect(
              vertices.some((point) => point.distanceTo(expected) < 1e-7)
            ).toBe(true);
          }
    });

    it("unions multiple views and deduplicates coincident intersection vertices", () => {
      const demand = createTileCameraDemand(
        snapshotTileCameraViews([
          orthographic("left"),
          orthographic("right", 20),
          orthographic("same-left"),
        ])
      );
      const vertices = demand.intersectionVertices(
        new Box3(new Vector3(-10, -10, -1), new Vector3(30, 10, 1))
      );

      expect(vertices).toHaveLength(16);
      for (const x of [-5, 5, 15, 25])
        expect(
          vertices.filter((vertex) => Math.abs(vertex.x - x) < 1e-7)
        ).toHaveLength(4);
    });

    it("does not mutate bounds, snapshots, cameras, compiled frusta or previous results", () => {
      const view = perspective("stable");
      const snapshots = snapshotTileCameraViews([view]);
      const demand = createTileCameraDemand(snapshots);
      const bounds = box(0);
      const boundsBefore = bounds.clone();
      const snapshotBefore = structuredClone(snapshots);
      const worldBefore = view.camera.matrixWorld.clone();
      const projectionBefore = view.camera.projectionMatrix.clone();
      const frustumBefore = demand.views[0].frustum.clone();
      const vertices = demand.intersectionVertices(bounds);
      const originalVertices = vertices.map((point) => point.clone());

      demand.intersectionVertices(box(5));
      expect(vertices).toEqual(originalVertices);
      vertices[0].set(1000, 1000, 1000);
      expect(demand.intersectionVertices(bounds)).toEqual(originalVertices);
      expect(bounds).toEqual(boundsBefore);
      expect(snapshots).toEqual(snapshotBefore);
      expect(view.camera.matrixWorld).toEqual(worldBefore);
      expect(view.camera.projectionMatrix).toEqual(projectionBefore);
      expect(demand.views[0].frustum).toEqual(frustumBefore);
    });

    it("keeps distinct vertices at tiny scene scales and large ECEF offsets", () => {
      for (const [offset, scale] of [
        [0, 1e-6],
        [6_000_000, 1],
      ] as const) {
        const view = orthographic("scaled", offset);
        view.camera.scale.setScalar(scale);
        const demand = createTileCameraDemand(snapshotTileCameraViews([view]));
        const bounds = box(offset, 0, 10 - 10 * scale, scale);
        const vertices = demand.intersectionVertices(bounds);

        expect(vertices).toHaveLength(8);
        const tolerance = offset ? 1e-6 : 1e-12;
        const actual = new Box3().setFromPoints(vertices);
        expect(actual.min.distanceTo(bounds.min)).toBeLessThan(tolerance);
        expect(actual.max.distanceTo(bounds.max)).toBeLessThan(tolerance);
      }
    });
  });
});
