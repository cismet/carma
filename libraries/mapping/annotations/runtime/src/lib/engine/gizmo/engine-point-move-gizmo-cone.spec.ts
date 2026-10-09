import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import {
  getConvexHull2d,
  projectConeArrowSilhouette,
  type ScreenPoint2,
} from "./engine-point-move-gizmo-math";

// Pinhole camera at z = -10 looking along +z; screen y runs down.
const CAMERA = new Vector3(0, 0, -10);
const FOCAL_PX = 100;
const CENTER = { x: 200, y: 200 };
const project = (world: Vector3): ScreenPoint2 | null => {
  const depth = world.z - CAMERA.z;
  if (depth <= 1e-6) return null;
  return {
    x: CENTER.x + (FOCAL_PX * (world.x - CAMERA.x)) / depth,
    y: CENTER.y - (FOCAL_PX * (world.y - CAMERA.y)) / depth,
  };
};

const EDGE_PX = 12;
const HEIGHT_PX = (EDGE_PX * Math.sqrt(3)) / 2;

const extent = (points: readonly ScreenPoint2[]) => ({
  width:
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
  height:
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  minY: Math.min(...points.map((p) => p.y)),
  maxY: Math.max(...points.map((p) => p.y)),
});

const rimCenterY = (rim: readonly ScreenPoint2[]) =>
  rim.reduce((sum, point) => sum + point.y, 0) / rim.length;

describe("getConvexHull2d", () => {
  it("drops interior points", () => {
    const hull = getConvexHull2d([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 2, y: 2 });
  });
});

describe("projectConeArrowSilhouette", () => {
  const origin = new Vector3(0, 0, 0);
  const anchor = project(origin)!;

  it("matches the flat arrow when the axis lies across the view", () => {
    const silhouette = projectConeArrowSilhouette({
      project,
      origin,
      direction: new Vector3(0, 1, 0),
      offsetPx: 30,
      edgePx: EDGE_PX,
      heightPx: HEIGHT_PX,
      anchorCanvasPosition: anchor,
      cameraPosition: CAMERA,
    });

    expect(silhouette).not.toBeNull();
    const { width, minY } = extent(silhouette!.hull);
    // the base centre sits 30 px above the anchor, the tip one arrow height
    // further; the rim, seen slightly from below, is a thin ellipse
    expect(rimCenterY(silhouette!.baseRim!)).toBeCloseTo(-30, 0);
    expect(width).toBeCloseTo(EDGE_PX, 0);
    expect(rimCenterY(silhouette!.baseRim!) - minY).toBeCloseTo(HEIGHT_PX, 0);
  });

  it("foreshortens and shows its base as the axis turns toward the camera", () => {
    const across = projectConeArrowSilhouette({
      project,
      origin,
      direction: new Vector3(0, 1, 0),
      offsetPx: 30,
      edgePx: EDGE_PX,
      heightPx: HEIGHT_PX,
      anchorCanvasPosition: anchor,
      cameraPosition: CAMERA,
    })!;
    // tilted away from the camera: the camera looks at the base
    const tilted = projectConeArrowSilhouette({
      project,
      origin,
      direction: new Vector3(0, 1, 2).normalize(),
      offsetPx: 30,
      edgePx: EDGE_PX,
      heightPx: HEIGHT_PX,
      anchorCanvasPosition: anchor,
      cameraPosition: CAMERA,
    })!;

    expect(tilted.baseRim).not.toBeNull();
    expect(extent(tilted.baseRim!).height).toBeGreaterThan(
      across.baseRim ? extent(across.baseRim).height : 0
    );
    // the tip moves toward the base on screen
    expect(rimCenterY(tilted.baseRim!) - extent(tilted.hull).minY).toBeLessThan(
      rimCenterY(across.baseRim!) - extent(across.hull).minY
    );
  });

  it("hides the base when the tip points at the camera side", () => {
    const silhouette = projectConeArrowSilhouette({
      project,
      origin,
      direction: new Vector3(0, 1, -2).normalize(),
      offsetPx: 30,
      edgePx: EDGE_PX,
      heightPx: HEIGHT_PX,
      anchorCanvasPosition: anchor,
      cameraPosition: CAMERA,
    });

    expect(silhouette).not.toBeNull();
    expect(silhouette!.baseRim).toBeNull();
  });

  it("gives up when the axis runs along the view ray", () => {
    expect(
      projectConeArrowSilhouette({
        project,
        origin,
        direction: new Vector3(0, 0, 1),
        offsetPx: 30,
        edgePx: EDGE_PX,
        heightPx: HEIGHT_PX,
        anchorCanvasPosition: anchor,
        cameraPosition: CAMERA,
      })
    ).toBeNull();
  });
});
