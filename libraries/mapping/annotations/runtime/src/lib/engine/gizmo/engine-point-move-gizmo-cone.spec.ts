import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import type { Point2 } from "@carma-commons/math";

import {
  createConeArrowMatrix,
  projectConeArrowSilhouette,
  resolveConeArrowGeometry,
} from "./engine-point-move-gizmo-cone";

// Pinhole camera at z = -10 looking along +z; screen y runs down.
const CAMERA = new Vector3(0, 0, -10);
const FOCAL_PX = 100;
const CENTER = { x: 200, y: 200 };
const project = (world: Vector3): Point2 | null => {
  const depth = world.z - CAMERA.z;
  if (depth <= 1e-6) return null;
  return {
    x: CENTER.x + (FOCAL_PX * (world.x - CAMERA.x)) / depth,
    y: CENTER.y - (FOCAL_PX * (world.y - CAMERA.y)) / depth,
  };
};

const EDGE_PX = 12;
const HEIGHT_PX = (EDGE_PX * Math.sqrt(3)) / 2;

const extent = (points: readonly Point2[]) => ({
  width:
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
  height:
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  minY: Math.min(...points.map((p) => p.y)),
  maxY: Math.max(...points.map((p) => p.y)),
});

const rimCenterY = (rim: readonly Point2[]) =>
  rim.reduce((sum, point) => sum + point.y, 0) / rim.length;

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

describe("resolveConeArrowGeometry", () => {
  const origin = new Vector3(0, 0, 0);
  const anchor = project(origin)!;
  const layout = {
    project,
    origin,
    direction: new Vector3(0, 1, 0),
    offsetPx: 30,
    edgePx: EDGE_PX,
    heightPx: HEIGHT_PX,
    anchorCanvasPosition: anchor,
    cameraPosition: CAMERA,
  };

  it("converts the pixel layout to metres at the depth of the arrow", () => {
    const geometry = resolveConeArrowGeometry(layout)!;
    // 10 m from the camera a metre spans 10 px
    const pixelsPerMeter = FOCAL_PX / 10;
    expect(geometry.baseCenter.y).toBeCloseTo(30 / pixelsPerMeter, 6);
    expect(geometry.radius).toBeCloseTo(EDGE_PX / 2 / pixelsPerMeter, 6);
    expect(geometry.height).toBeCloseTo(HEIGHT_PX / pixelsPerMeter, 6);
    expect(geometry.apex.y).toBeCloseTo(
      geometry.baseCenter.y + geometry.height,
      6
    );
  });

  it("scales with the distance so the arrow keeps its screen size", () => {
    const near = resolveConeArrowGeometry(layout)!;
    const farOrigin = new Vector3(0, 0, 10);
    const far = resolveConeArrowGeometry({
      ...layout,
      origin: farOrigin,
      anchorCanvasPosition: project(farOrigin)!,
    })!;
    expect(far.radius / near.radius).toBeCloseTo(2, 6);
    expect(far.height / near.height).toBeCloseTo(2, 6);
  });
});

describe("createConeArrowMatrix", () => {
  it("puts the unit cone's base on the base rim and its tip on the apex", () => {
    const origin = new Vector3(0, 0, 0);
    const geometry = resolveConeArrowGeometry({
      project,
      origin,
      direction: new Vector3(1, 1, 0).normalize(),
      offsetPx: 30,
      edgePx: EDGE_PX,
      heightPx: HEIGHT_PX,
      anchorCanvasPosition: project(origin)!,
      cameraPosition: CAMERA,
    })!;
    const matrix = createConeArrowMatrix(geometry);

    const tip = new Vector3(0, 0, 1).applyMatrix4(matrix);
    expect(tip.distanceTo(geometry.apex)).toBeCloseTo(0, 9);
    const baseCenter = new Vector3(0, 0, 0).applyMatrix4(matrix);
    expect(baseCenter.distanceTo(geometry.baseCenter)).toBeCloseTo(0, 9);
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [-0.6, 0.8],
    ] as const) {
      const rimPoint = new Vector3(x, y, 0).applyMatrix4(matrix);
      expect(rimPoint.distanceTo(geometry.baseCenter)).toBeCloseTo(
        geometry.radius,
        9
      );
      expect(
        rimPoint.clone().sub(geometry.baseCenter).dot(geometry.direction)
      ).toBeCloseTo(0, 9);
    }
    // right-handed, so front faces stay front faces
    expect(matrix.determinant()).toBeGreaterThan(0);
  });
});
