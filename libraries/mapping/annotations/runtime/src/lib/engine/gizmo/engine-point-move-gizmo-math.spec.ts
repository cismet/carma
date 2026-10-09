import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";

import type {
  AnnotationEngine,
  AnnotationPickRay,
  AnnotationScreenPosition,
  AnnotationSurfacePick,
  AnnotationSurfacePickOptions,
} from "../annotation-engine.types";
import {
  getAxisParamFromClientPosition,
  getAxisSampleWorldStep,
  getGroundPointFromClientPosition,
  getPlaneAngleFromClientPosition,
  getPlanePixelsPerWorldMax,
  getPlanePointFromClientPosition,
  projectPlaneOutlinePoints,
  rotateVectorByVersor,
} from "./engine-point-move-gizmo-math";

const CANVAS_RECT = { left: 10, top: 20 };

type MockEngineOptions = {
  worldToScreen?: (positionECEF: Vector3) => AnnotationScreenPosition | null;
  getPickRay?: (
    screenPosition: AnnotationScreenPosition
  ) => AnnotationPickRay | null;
  resolveSurfacePick?: (
    screenPosition: AnnotationScreenPosition,
    options?: AnnotationSurfacePickOptions
  ) => AnnotationSurfacePick;
  isDestroyed?: boolean;
};

const createMockEngine = ({
  worldToScreen = () => null,
  getPickRay = () => null,
  resolveSurfacePick = () => ({
    surfacePositionECEF: null,
    globePositionECEF: null,
  }),
  isDestroyed = false,
}: MockEngineOptions = {}): AnnotationEngine =>
  ({
    canvas: {
      getBoundingClientRect: () => CANVAS_RECT,
    } as unknown as HTMLCanvasElement,
    isDestroyed: () => isDestroyed,
    worldToScreen,
    getPickRay,
    resolveSurfacePick,
  } as unknown as AnnotationEngine);

// Orthographic top-down projection: metres along +X go right, +Y go up.
const projectTopDown = (position: Vector3): AnnotationScreenPosition => ({
  x: 100 + 2 * position.x,
  y: 100 - 2 * position.y,
});

const downwardRayAt =
  (originX: number, originY: number) => (): AnnotationPickRay => ({
    origin: new Vector3(originX, originY, 10),
    direction: new Vector3(0, 0, -1),
  });

describe("rotateVectorByVersor", () => {
  it("rotates a vector around the axis by the angle", () => {
    const rotated = rotateVectorByVersor(
      new Vector3(1, 0, 0),
      new Vector3(0, 0, 2),
      Math.PI / 2
    );
    expect(rotated.x).toBeCloseTo(0, 10);
    expect(rotated.y).toBeCloseTo(1, 10);
    expect(rotated.z).toBeCloseTo(0, 10);
  });

  it("returns a unit vector", () => {
    const rotated = rotateVectorByVersor(
      new Vector3(3, 4, 0),
      new Vector3(1, 1, 1),
      0.7
    );
    expect(rotated.length()).toBeCloseTo(1, 10);
  });
});

describe("getAxisSampleWorldStep", () => {
  it("returns 0 for a degenerate unit sample", () => {
    expect(getAxisSampleWorldStep(0, 48, 0.25, 500)).toBe(0);
    expect(getAxisSampleWorldStep(Number.NaN, 48, 0.25, 500)).toBe(0);
  });

  it("clamps the world step to the configured range", () => {
    expect(getAxisSampleWorldStep(24, 48, 0.25, 500)).toBe(2);
    expect(getAxisSampleWorldStep(1000, 48, 0.25, 500)).toBe(0.25);
    expect(getAxisSampleWorldStep(0.01, 48, 0.25, 500)).toBe(500);
  });
});

describe("getPlanePixelsPerWorldMax", () => {
  it("returns the largest projected unit-circle extent", () => {
    const engine = createMockEngine({ worldToScreen: projectTopDown });
    const origin = new Vector3(0, 0, 0);
    const pixelsPerWorld = getPlanePixelsPerWorldMax(
      engine,
      origin,
      { xAxis: new Vector3(1, 0, 0), yAxis: new Vector3(0, 1, 0) },
      projectTopDown(origin),
      16
    );
    expect(pixelsPerWorld).toBeCloseTo(2, 10);
  });

  it("ignores samples behind the camera", () => {
    const engine = createMockEngine({ worldToScreen: () => null });
    expect(
      getPlanePixelsPerWorldMax(
        engine,
        new Vector3(),
        { xAxis: new Vector3(1, 0, 0), yAxis: new Vector3(0, 1, 0) },
        { x: 0, y: 0 },
        8
      )
    ).toBe(0);
  });
});

describe("projectPlaneOutlinePoints", () => {
  it("projects the outline relative to the anchor", () => {
    const engine = createMockEngine({ worldToScreen: projectTopDown });
    const origin = new Vector3(5, 5, 0);
    const points = projectPlaneOutlinePoints(
      engine,
      origin,
      { xAxis: new Vector3(1, 0, 0), yAxis: new Vector3(0, 1, 0) },
      3,
      4,
      projectTopDown(origin)
    );
    expect(points).toHaveLength(4);
    expect(points[0].x).toBeCloseTo(6, 10);
    expect(points[0].y).toBeCloseTo(0, 10);
    expect(points[1].x).toBeCloseTo(0, 10);
    expect(points[1].y).toBeCloseTo(-6, 10);
  });

  it("drops points beyond the absolute pixel limit", () => {
    const engine = createMockEngine({ worldToScreen: projectTopDown });
    const points = projectPlaneOutlinePoints(
      engine,
      new Vector3(),
      { xAxis: new Vector3(1, 0, 0), yAxis: new Vector3(0, 1, 0) },
      10,
      4,
      { x: 100, y: 100 },
      15
    );
    expect(points).toHaveLength(0);
  });
});

describe("getAxisParamFromClientPosition", () => {
  it("derives the canvas position from the client position", () => {
    const getPickRay = vi.fn(downwardRayAt(0, 0));
    const engine = createMockEngine({ getPickRay });
    getAxisParamFromClientPosition(
      engine,
      110,
      140,
      new Vector3(),
      new Vector3(1, 0, 0)
    );
    expect(getPickRay).toHaveBeenCalledWith({ x: 100, y: 120 });
  });

  it("returns the axis parameter closest to the pick ray", () => {
    const engine = createMockEngine({ getPickRay: downwardRayAt(3, 0) });
    expect(
      getAxisParamFromClientPosition(
        engine,
        0,
        0,
        new Vector3(),
        new Vector3(1, 0, 0)
      )
    ).toBeCloseTo(3, 10);
  });

  it("returns null without a pick ray or on a destroyed engine", () => {
    expect(
      getAxisParamFromClientPosition(
        createMockEngine(),
        0,
        0,
        new Vector3(),
        new Vector3(1, 0, 0)
      )
    ).toBeNull();
    expect(
      getAxisParamFromClientPosition(
        createMockEngine({
          getPickRay: downwardRayAt(0, 0),
          isDestroyed: true,
        }),
        0,
        0,
        new Vector3(),
        new Vector3(1, 0, 0)
      )
    ).toBeNull();
  });
});

describe("getPlanePointFromClientPosition", () => {
  it("intersects the pick ray with the plane", () => {
    const engine = createMockEngine({ getPickRay: downwardRayAt(1, 2) });
    const planePoint = getPlanePointFromClientPosition(
      engine,
      0,
      0,
      new Vector3(0, 0, 0),
      new Vector3(0, 0, 1)
    );
    expect(planePoint).not.toBeNull();
    expect(planePoint!.x).toBeCloseTo(1, 10);
    expect(planePoint!.y).toBeCloseTo(2, 10);
    expect(planePoint!.z).toBeCloseTo(0, 10);
  });

  it("returns null for a ray parallel to the plane", () => {
    const engine = createMockEngine({ getPickRay: downwardRayAt(0, 0) });
    expect(
      getPlanePointFromClientPosition(
        engine,
        0,
        0,
        new Vector3(),
        new Vector3(1, 0, 0)
      )
    ).toBeNull();
  });
});

describe("getPlaneAngleFromClientPosition", () => {
  it("returns the in-plane angle of the picked point", () => {
    const engine = createMockEngine({ getPickRay: downwardRayAt(0, 2) });
    expect(
      getPlaneAngleFromClientPosition(
        engine,
        0,
        0,
        new Vector3(),
        new Vector3(0, 0, 1),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      )
    ).toBeCloseTo(Math.PI / 2, 10);
  });

  it("returns null at the plane origin", () => {
    const engine = createMockEngine({ getPickRay: downwardRayAt(0, 0) });
    expect(
      getPlaneAngleFromClientPosition(
        engine,
        0,
        0,
        new Vector3(),
        new Vector3(0, 0, 1),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      )
    ).toBeNull();
  });
});

describe("getGroundPointFromClientPosition", () => {
  it("returns a copy of the surface position and forwards the exclusions", () => {
    const surface = new Vector3(1, 2, 3);
    const resolveSurfacePick = vi.fn(() => ({
      surfacePositionECEF: surface,
      globePositionECEF: new Vector3(9, 9, 9),
    }));
    const engine = createMockEngine({ resolveSurfacePick });
    const groundPoint = getGroundPointFromClientPosition(engine, 110, 140, {
      includeDragSampleExclusions: true,
    });
    expect(groundPoint).toEqual(surface);
    expect(groundPoint).not.toBe(surface);
    expect(resolveSurfacePick).toHaveBeenCalledWith(
      { x: 100, y: 120 },
      { resolveGlobePosition: true, excludeDragSampleOccluders: true }
    );
  });

  it("falls back to the globe position", () => {
    const globe = new Vector3(4, 5, 6);
    const engine = createMockEngine({
      resolveSurfacePick: () => ({
        surfacePositionECEF: null,
        globePositionECEF: globe,
      }),
    });
    expect(getGroundPointFromClientPosition(engine, 0, 0)).toEqual(globe);
  });

  it("returns null when picking throws", () => {
    const engine = createMockEngine({
      resolveSurfacePick: () => {
        throw new Error("streaming");
      },
    });
    expect(getGroundPointFromClientPosition(engine, 0, 0)).toBeNull();
  });
});
