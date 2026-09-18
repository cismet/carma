import {
  Box3,
  Group,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import {
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
  createTileCameraDemand,
  snapshotTileCameraViews,
  tileCameraViewsSignature,
  type TileCameraView,
} from "./tile-camera-demand";

const viewport = [1000, 1000] as const;

const perspective = (id: string, role = TILE_CAMERA_ROLE.RECEIVER) => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    id,
    camera,
    viewport,
    errorTargetPixels: 1,
    role,
  } satisfies TileCameraView;
};

const orthographic = (
  id: string,
  x = 0,
  z = 10,
  role = TILE_CAMERA_ROLE.RECEIVER,
  viewportSize: readonly [number, number] = viewport
) => {
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  camera.position.set(x, 0, z);
  camera.lookAt(x, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    id,
    camera,
    viewport: viewportSize,
    errorTargetPixels: 1,
    role,
  } satisfies TileCameraView;
};

const box = (x: number, y = 0, z = 0, size = 1) =>
  new Box3(
    new Vector3(x - size, y - size, z - size),
    new Vector3(x + size, y + size, z + size)
  );

describe("tile camera demand", () => {
  it.each([TILE_CAMERA_ROLE.RECEIVER, TILE_CAMERA_ROLE.GEOMETRY])(
    "keeps stricter low-priority %s detail in either camera order",
    (role) => {
      const primary = { ...orthographic("main"), errorTargetPixels: 4 };
      const detail = {
        ...orthographic("detail", 0, 10, role),
        priority: TILE_CAMERA_PRIORITY.SECONDARY,
        errorTargetPixels: 0.5,
      };
      for (const views of [[primary, detail], [detail, primary]]) {
        const demand = createTileCameraDemand(snapshotTileCameraViews(views));
        expect(demand.evaluate(box(0), 1)).toMatchObject({
          required: true,
          priority: TILE_CAMERA_PRIORITY.PRIMARY,
          errorRatio: 200,
        });
      }
    }
  );

  it("ignores the invisible near portion of a frustum-edge tile", () => {
    const view = perspective("edge");
    const demand = createTileCameraDemand(snapshotTileCameraViews([view]));
    const extended = new Box3(new Vector3(5, -1, -10), new Vector3(6, 1, 9));
    const clipped = new Box3(new Vector3(5, -1, -10), new Vector3(6, 1, 2));
    // Neither box is visible above z=10-5/tan(30°). That invisible
    // extension must not increase requested detail.
    const error = demand.evaluate(extended, 1).errorRatio;
    expect(demand.evaluate(clipped, 1).errorRatio).toBeCloseTo(error, 8);
  });

  it("does not reverse error along equal-depth radial tile rows", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([perspective("radial")])
    );
    for (let angle = 0; angle < 8; angle++) {
      let previous = Number.POSITIVE_INFINITY;
      for (let radius = 0; radius <= 5; radius++) {
        const x = radius * Math.cos((angle * Math.PI) / 4);
        const y = radius * Math.sin((angle * Math.PI) / 4);
        const result = demand.evaluate(box(x, y, 0, 0.1), 1);
        expect(result.required).toBe(true);
        expect(result.errorRatio).toBeLessThanOrEqual(previous + 1e-8);
        previous = result.errorRatio;
      }
    }
  });
  it("defaults existing receivers and geometry cameras to primary priority", () => {
    for (const role of [TILE_CAMERA_ROLE.RECEIVER, TILE_CAMERA_ROLE.GEOMETRY]) {
      const snapshots = snapshotTileCameraViews([
        { ...perspective("existing"), role },
      ]);
      expect(snapshots[0].priority).toBe(TILE_CAMERA_PRIORITY.PRIMARY);
      expect(
        createTileCameraDemand(snapshots).evaluate(box(0), 1).priority
      ).toBe(TILE_CAMERA_PRIORITY.PRIMARY);
    }
    expect(() =>
      snapshotTileCameraViews([{ ...perspective("invalid"), priority: NaN }])
    ).toThrow("Invalid tile camera");
  });

  it("keeps one shared demand with the maximum intersecting priority and independent receiver/error union", () => {
    const low = {
      ...orthographic("array"),
      priority: TILE_CAMERA_PRIORITY.SECONDARY,
    };
    const high = {
      ...orthographic("selected"),
      priority: TILE_CAMERA_PRIORITY.FOCUS,
      role: TILE_CAMERA_ROLE.GEOMETRY,
      errorTargetPixels: 4,
    };
    const demand = createTileCameraDemand(snapshotTileCameraViews([low, high]));
    expect(demand.evaluate(box(0), 1)).toMatchObject({
      required: true,
      receiver: true,
      priority: TILE_CAMERA_PRIORITY.FOCUS,
      errorRatio: 100,
    });
    expect(demand.evaluate(box(20), 1)).toMatchObject({
      required: false,
      receiver: false,
      priority: Number.NEGATIVE_INFINITY,
      errorRatio: 0,
    });
  });

  it("changes the demand signature and rank when selecting another camera without moving it", () => {
    const left = {
      ...orthographic("left"),
      priority: TILE_CAMERA_PRIORITY.FOCUS,
    };
    const right = {
      ...orthographic("right", 20),
      priority: TILE_CAMERA_PRIORITY.SECONDARY,
    };
    const before = snapshotTileCameraViews([left, right]);
    const after = snapshotTileCameraViews([
      { ...left, priority: TILE_CAMERA_PRIORITY.SECONDARY },
      { ...right, priority: TILE_CAMERA_PRIORITY.FOCUS },
    ]);
    expect(tileCameraViewsSignature(before)).not.toBe(
      tileCameraViewsSignature(after)
    );
    const demand = createTileCameraDemand(after);
    expect(demand.evaluate(box(0), 1).priority).toBe(
      TILE_CAMERA_PRIORITY.SECONDARY
    );
    expect(demand.evaluate(box(20), 1).priority).toBe(
      TILE_CAMERA_PRIORITY.FOCUS
    );
    expect(after.map(({ matrixWorld }) => matrixWorld)).toEqual(
      before.map(({ matrixWorld }) => matrixWorld)
    );
  });
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

  it("unions perspective and orthographic views and lets the stricter target win", () => {
    const views = snapshotTileCameraViews([
      perspective("perspective"),
      orthographic("orthographic", 20),
    ]);
    const demand = createTileCameraDemand(views);

    expect(demand.evaluate(box(0), 1)).toMatchObject({
      required: true,
      receiver: true,
    });
    expect(demand.evaluate(box(20), 1).required).toBe(true);

    const permissive = snapshotTileCameraViews([
      { ...perspective("permissive"), errorTargetPixels: 4 },
    ]);
    const strict = snapshotTileCameraViews([
      { ...perspective("strict"), errorTargetPixels: 1 },
    ]);
    expect(createTileCameraDemand(strict).evaluate(box(0), 1).errorRatio).toBe(
      4 * createTileCameraDemand(permissive).evaluate(box(0), 1).errorRatio
    );
    expect(
      createTileCameraDemand(strict).evaluate(box(0), 1).errorRatio
    ).toBeGreaterThan(0);
  });

  it("separates geometry-only demand from receiver demand", () => {
    const geometry = snapshotTileCameraViews([
      perspective("caster", TILE_CAMERA_ROLE.GEOMETRY),
    ]);
    const receiver = snapshotTileCameraViews([
      perspective("receiver", TILE_CAMERA_ROLE.RECEIVER),
    ]);

    expect(createTileCameraDemand(geometry).evaluate(box(0), 1)).toMatchObject({
      required: true,
      receiver: false,
    });
    expect(createTileCameraDemand(receiver).evaluate(box(0), 1).receiver).toBe(
      true
    );
  });

  it("culls far and elevated boxes outside disjoint frusta", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([perspective("main"), orthographic("far", 20)])
    );

    expect(demand.evaluate(box(0), 1).required).toBe(true);
    expect(demand.evaluate(box(20), 1).required).toBe(true);
    expect(demand.evaluate(box(100, 100), 1).required).toBe(false);
  });

  it("uses a parented camera world transform", () => {
    const parent = new Group();
    parent.position.set(20, 0, 0);
    const view = perspective("parented");
    view.camera.position.set(0, 0, 10);
    parent.add(view.camera);
    parent.updateMatrixWorld(true);

    const [snapshot] = snapshotTileCameraViews([view]);
    expect(snapshot.matrixWorld[12]).toBeCloseTo(20);
    expect(
      createTileCameraDemand([snapshot]).evaluate(box(20), 1).required
    ).toBe(true);
  });

  it("freezes snapshots when the source camera moves", () => {
    const view = perspective("stable");
    const [snapshot] = snapshotTileCameraViews([view]);
    const before = structuredClone(snapshot);
    view.camera.position.x = 100;
    view.camera.updateMatrixWorld(true);

    expect(snapshot).toEqual(before);
    expect(
      createTileCameraDemand([snapshot]).evaluate(box(0), 1).required
    ).toBe(true);
  });

  it("keeps signatures stable when IDs are reordered", () => {
    const snapshots = snapshotTileCameraViews([
      perspective("a"),
      perspective("b"),
    ]);
    expect(tileCameraViewsSignature(snapshots)).toBe(
      tileCameraViewsSignature([...snapshots].reverse())
    );
  });

  it("rejects duplicate IDs and invalid projections", () => {
    const duplicate = perspective("same");
    expect(() => snapshotTileCameraViews([duplicate, duplicate])).toThrow(
      "Duplicate tile camera"
    );

    const invalid = perspective("invalid");
    invalid.camera.projectionMatrix.elements.fill(0);
    expect(() => snapshotTileCameraViews([invalid])).toThrow(
      "Invalid tile camera"
    );
  });

  it("retains the remaining demand when one view is removed", () => {
    const views = snapshotTileCameraViews([
      perspective("main"),
      orthographic("caster", 20),
    ]);
    const remaining = createTileCameraDemand(
      views.filter(({ id }) => id === "caster")
    );

    expect(remaining.evaluate(box(20), 1).required).toBe(true);
    expect(remaining.evaluate(box(0), 1).required).toBe(false);
  });

  it("makes orthographic error independent of camera distance", () => {
    const near = createTileCameraDemand(
      snapshotTileCameraViews([orthographic("near", 0, 10)])
    );
    const far = createTileCameraDemand(
      snapshotTileCameraViews([orthographic("far", 0, 100)])
    );

    expect(far.evaluate(box(0), 1).errorRatio).toBe(
      near.evaluate(box(0), 1).errorRatio
    );
  });

  it("uses the larger projected axis for a rectangular orthographic viewport", () => {
    const view = orthographic(
      "portrait",
      0,
      10,
      TILE_CAMERA_ROLE.RECEIVER,
      [100, 1000]
    );
    const demand = createTileCameraDemand(snapshotTileCameraViews([view]));

    expect(demand.evaluate(box(0), 1).errorRatio).toBeCloseTo(100);
  });
});
