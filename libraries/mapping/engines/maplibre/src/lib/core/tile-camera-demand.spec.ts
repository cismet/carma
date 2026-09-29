import { Group } from "three";
import { describe, expect, it } from "vitest";
import {
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
  createTileCameraDemand,
  snapshotTileCameraViews,
  tileCameraViewsSignature,
} from "./tile-camera-demand";
import {
  viewport,
  perspective,
  orthographic,
  box,
} from "./tile-camera-demand.test-support";

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
      for (const views of [
        [primary, detail],
        [detail, primary],
      ]) {
        const demand = createTileCameraDemand(snapshotTileCameraViews(views));
        expect(demand.evaluate(box(0), 1)).toMatchObject({
          required: true,
          priority: TILE_CAMERA_PRIORITY.PRIMARY,
          errorRatio: 200,
        });
      }
    }
  );

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
