import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
  createTileCameraDemand,
  snapshotTileCameraViews,
} from "./tile-camera-demand";
import {
  viewport,
  perspective,
  orthographic,
  box,
} from "./tile-camera-demand.test-support";

describe("tile camera screen area", () => {
  it("only computes visible area on request, using the supplied CSS viewport", () => {
    const view = orthographic("area");
    // A rotated square has twice the bounding-rectangle area; use its hull.
    view.camera.rotateZ(Math.PI / 4);
    const demand = createTileCameraDemand(snapshotTileCameraViews([view]));
    const intersections = vi.spyOn(demand, "intersectionVertices");
    expect(demand.evaluate(box(0), 1).visibleAreaPixels).toBe(0);
    expect(intersections).not.toHaveBeenCalled();
    expect(
      demand.evaluate(box(0), 1, undefined, true).visibleAreaPixels
    ).toBeCloseTo(40_000, 6);
    expect(intersections).not.toHaveBeenCalled();
    const wider = createTileCameraDemand(
      snapshotTileCameraViews([{ ...view, viewport: [2000, 1000] }])
    );
    expect(
      wider.evaluate(box(0), 1, undefined, true).visibleAreaPixels
    ).toBeCloseTo(80_000, 6);
    expect(demand.evaluate(box(0), 1).visibleAreaPixels).toBe(0);
  });

  it("adds the three disjoint visible faces from every camera octant", () => {
    for (const x of [-10, 10])
      for (const y of [-10, 10])
        for (const z of [-10, 10]) {
          const view = orthographic("three-faces");
          view.camera.position.set(x, y, z);
          view.camera.lookAt(0, 0, 0);
          const demand = createTileCameraDemand(
            snapshotTileCameraViews([view])
          );
          const intersections = vi.spyOn(demand, "intersectionVertices");
          const result = demand.evaluate(box(0), 1, undefined, true);
          expect(result.visibleAreaPixels).toBeCloseTo(
            40_000 * Math.sqrt(3),
            6
          );
          expect(result.errorRatio).toBeCloseTo(100, 10);
          expect(intersections).not.toHaveBeenCalled();
        }
  });

  it("uses clipped front faces for perspective area and the nearest visible depth", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([perspective("edge")])
    );
    const intersections = vi.spyOn(demand, "intersectionVertices");
    const bounds = new Box3(new Vector3(5, -1, -10), new Vector3(6, 1, 9));
    const result = demand.evaluate(bounds, 1, undefined, true);
    // Right viewport boundary meets x=5 at depth=5/tan(30 degrees).
    // The projected silhouette is a trapezoid from x=sqrt(3)/4 to x=1,
    // with half-heights sqrt(3)/20 and 1/5 in NDC.
    expect(result.errorRatio).toBeCloseTo(100, 8);
    expect(result.visibleAreaPixels).toBeCloseTo(
      (1 - Math.sqrt(3) / 4) * (Math.sqrt(3) / 20 + 1 / 5) * 250_000,
      6
    );
    expect(intersections).not.toHaveBeenCalled();
  });

  it("preserves a transformed and reflected box's projected footprint", () => {
    const view = orthographic("transformed");
    view.camera.position.set(10, 10, 10);
    view.camera.lookAt(0, 0, 0);
    const demand = createTileCameraDemand(snapshotTileCameraViews([view]));
    const transform = new Matrix4().makeScale(-2, 1, 0.5);
    const intersections = vi.spyOn(demand, "intersectionVertices");
    const result = demand.evaluate(box(0), 1, undefined, true, transform);
    expect(result.visibleAreaPixels).toBeCloseTo(140_000 / Math.sqrt(3), 6);
    expect(intersections).not.toHaveBeenCalled();
  });

  it("clips a viewport completely enclosed by the projected box faces", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([orthographic("enclosing")])
    );
    const intersections = vi.spyOn(demand, "intersectionVertices");
    const bounds = new Box3(new Vector3(-20, -20, -1), new Vector3(20, 20, 1));
    expect(
      demand.evaluate(bounds, 1, undefined, true).visibleAreaPixels
    ).toBeCloseTo(1_000_000, 6);
    expect(intersections).not.toHaveBeenCalled();
  });

  it("retains the volume solver for far-plane and near-plane cuts", () => {
    const view = perspective("depth-cuts");
    view.camera.far = 11;
    view.camera.updateProjectionMatrix();
    const demand = createTileCameraDemand(snapshotTileCameraViews([view]));
    const intersections = vi.spyOn(demand, "intersectionVertices");
    expect(
      demand.evaluate(box(0, 0, -1), 1, undefined, true).visibleAreaPixels
    ).toBeCloseTo(30_000, 6);
    expect(intersections).toHaveBeenCalledTimes(1);
    expect(
      demand.evaluate(box(0, 0, 10), 1, undefined, true).visibleAreaPixels
    ).toBeCloseTo(1_000_000, 5);
    expect(intersections).toHaveBeenCalledTimes(2);
  });

  it("exposes error-only contributions without projecting a footprint", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([orthographic("error-only")])
    );
    const intersections = vi.spyOn(demand, "intersectionVertices");
    const result = demand.evaluate(
      box(0),
      2,
      undefined,
      false,
      undefined,
      true
    );
    expect(result.contributions).toMatchObject([
      {
        id: "error-only",
        errorPixels: 200,
        visibleAreaPixels: 0,
        visibleAreaFraction: 0,
      },
    ]);
    expect(intersections).not.toHaveBeenCalled();
    expect(demand.evaluate(box(0), 2).contributions).toBeUndefined();
  });

  it("keeps camera area fractions invariant across viewport and DPR buffer sizes", () => {
    const views = [
      orthographic("small-css", 0, 10, TILE_CAMERA_ROLE.RECEIVER, [200, 100]),
      orthographic("large-css", 0, 10, TILE_CAMERA_ROLE.RECEIVER, [400, 200]),
      // The same projection rendered into a DPR-2 buffer has four times the
      // pixel area, while its relative contribution still covers 4% of a view.
      orthographic("large-dpr2", 0, 10, TILE_CAMERA_ROLE.GEOMETRY, [800, 400]),
    ];
    const demand = createTileCameraDemand(snapshotTileCameraViews(views));
    const result = demand.evaluate(box(0), 1, undefined, true);
    expect(result.contributions).toHaveLength(3);
    for (const [index, contribution] of result.contributions!.entries()) {
      const [width, height] = views[index].viewport;
      expect(contribution.visibleAreaFraction).toBeCloseTo(0.04, 12);
      expect(contribution.visibleAreaPixels).toBeCloseTo(width * height * 0.04);
      expect(contribution.visibleAreaFraction).toBe(
        contribution.visibleAreaPixels / (width * height)
      );
      // Pixel SSE still follows the supplied render resolution; only area
      // weighting is normalized across windows and shadow-map buffers.
      expect(contribution.errorPixels).toBeCloseTo(width / 10);
    }
  });

  it("keeps errors and areas paired for disjoint camera footprints", () => {
    const left = { ...orthographic("left"), errorTargetPixels: 2 };
    const right = {
      ...orthographic("right", 20, 10, TILE_CAMERA_ROLE.GEOMETRY, [500, 500]),
      errorTargetPixels: 0.25,
      priority: TILE_CAMERA_PRIORITY.SECONDARY,
    };
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([left, right])
    );
    const bounds = new Box3(new Vector3(-2, -1, -1), new Vector3(23, 1, 1));
    const result = demand.evaluate(bounds, 1, undefined, true);
    expect(result).toMatchObject({
      required: true,
      receiver: true,
      errorRatio: 200,
      priority: TILE_CAMERA_PRIORITY.PRIMARY,
    });
    const [leftContribution, rightContribution] = result.contributions!;
    expect(leftContribution).toMatchObject({
      id: "left",
      role: TILE_CAMERA_ROLE.RECEIVER,
      errorPixels: 100,
      errorTargetPixels: 2,
      errorRatio: 50,
      priority: TILE_CAMERA_PRIORITY.PRIMARY,
    });
    expect(rightContribution).toMatchObject({
      id: "right",
      role: TILE_CAMERA_ROLE.GEOMETRY,
      errorPixels: 50,
      errorTargetPixels: 0.25,
      errorRatio: 200,
      priority: TILE_CAMERA_PRIORITY.SECONDARY,
    });
    expect(leftContribution.visibleAreaFraction).toBeCloseTo(0.14, 12);
    expect(rightContribution.visibleAreaFraction).toBeCloseTo(0.16, 12);
    expect(leftContribution.visibleAreaPixels).toBeCloseTo(140_000);
    expect(rightContribution.visibleAreaPixels).toBeCloseTo(40_000);
    expect(result.visibleAreaPixels).toBeCloseTo(140_000);
    expect(
      demand
        .evaluate(box(0), 1, undefined, true)
        .contributions!.map(({ id }) => id)
    ).toEqual(["left"]);
    expect(
      demand
        .evaluate(box(20), 1, undefined, true)
        .contributions!.map(({ id }) => id)
    ).toEqual(["right"]);
  });

  it("preserves aggregate demand without volume intersections for ordinary views", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([perspective("main"), orthographic("geometry")])
    );
    const bounds = box(0);
    const aggregate = { ...demand.evaluate(bounds, 1) };
    expect(aggregate.contributions).toBeUndefined();
    const intersections = vi.spyOn(demand, "intersectionVertices");
    const detailed = demand.evaluate(bounds, 1, undefined, true);
    expect(intersections).not.toHaveBeenCalled();
    expect(detailed).toMatchObject({
      required: aggregate.required,
      receiver: aggregate.receiver,
      errorRatio: aggregate.errorRatio,
      priority: aggregate.priority,
    });
    const contributions = detailed.contributions!;
    expect(contributions).toHaveLength(2);
    expect(detailed.errorRatio).toBe(
      Math.max(...contributions.map(({ errorRatio }) => errorRatio))
    );
    expect(detailed.visibleAreaPixels).toBe(
      Math.max(
        ...contributions.map(({ visibleAreaPixels }) => visibleAreaPixels)
      )
    );
    expect(demand.evaluate(bounds, 1).contributions).toBeUndefined();
    expect(contributions).toHaveLength(0);
    expect(intersections).not.toHaveBeenCalled();
    expect(demand.evaluate(box(100), 1, undefined, true).contributions).toEqual(
      []
    );
    expect(
      demand
        .evaluate(bounds, 1, "main", true)
        .contributions!.map(({ id }) => id)
    ).toEqual(["geometry"]);
    expect(
      demand.evaluate(new Box3(), 1, undefined, true).contributions
    ).toEqual([]);
  });

  it("clips visible area to viewport edges and clears it for missed or excluded views", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([orthographic("area")])
    );
    const bounds = new Box3(new Vector3(3, -1, -1), new Vector3(6, 1, 1));
    const clipped = demand.evaluate(bounds, 1, undefined, true);
    expect(clipped.visibleAreaPixels).toBeCloseTo(40_000, 6);
    expect(clipped.contributions?.[0].visibleAreaFraction).toBeCloseTo(0.04, 8);
    expect(demand.evaluate(box(100), 1, undefined, true)).toMatchObject({
      required: false,
      visibleAreaPixels: 0,
    });
    expect(demand.evaluate(bounds, 1, "area", true).visibleAreaPixels).toBe(0);
  });

  it("clips near-plane crossings before projection, including a camera inside bounds", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([perspective("area")])
    );
    const crossing = new Box3(
      new Vector3(0.02, -0.01, 9.8),
      new Vector3(0.04, 0.01, 10.1)
    );
    const clipped = demand.evaluate(crossing, 1, undefined, true);
    expect(clipped.visibleAreaPixels).toBeCloseTo(41_250, 5);
    expect(clipped.contributions?.[0].visibleAreaFraction).toBeCloseTo(
      0.04125,
      8
    );
    expect(
      demand.evaluate(box(0, 0, 10), 1, undefined, true).visibleAreaPixels
    ).toBeCloseTo(1_000_000, 5);
  });

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
});
