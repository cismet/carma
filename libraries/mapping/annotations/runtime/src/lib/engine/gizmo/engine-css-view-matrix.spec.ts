import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import type {
  AnnotationEngine,
  AnnotationScreenPosition,
} from "../annotation-engine.types";
import {
  applyCssForward,
  applyCssInverse,
  buildEngineCssViewMatrix,
} from "./engine-css-view-matrix";

const createMockEngine = (
  worldToScreen: (positionECEF: Vector3) => AnnotationScreenPosition | null,
  isDestroyed = false
): AnnotationEngine =>
  ({
    isDestroyed: () => isDestroyed,
    worldToScreen,
  } as unknown as AnnotationEngine);

// Affine projection: +X maps to 2 px right, +Y maps to 3 px up.
const projectAffine = (position: Vector3): AnnotationScreenPosition => ({
  x: 100 + 2 * position.x,
  y: 50 - 3 * position.y,
});

describe("buildEngineCssViewMatrix", () => {
  it("samples the forward matrix and its inverse through the engine", () => {
    const result = buildEngineCssViewMatrix({
      engine: createMockEngine(projectAffine),
      originECEF: new Vector3(0, 0, 0),
      xAxisECEF: new Vector3(5, 0, 0),
      yAxisECEF: new Vector3(0, 0.5, 0),
    });
    expect(result).not.toBeNull();
    expect(result!.originCanvas).toEqual({ x: 100, y: 50 });
    expect(result!.forward.a11).toBeCloseTo(2, 10);
    expect(result!.forward.a12).toBeCloseTo(0, 10);
    expect(result!.forward.a21).toBeCloseTo(0, 10);
    expect(result!.forward.a22).toBeCloseTo(-3, 10);
    expect(result!.determinant).toBeCloseTo(-6, 10);
    expect(result!.inverse.a11).toBeCloseTo(0.5, 10);
    expect(result!.inverse.a22).toBeCloseTo(-1 / 3, 10);
  });

  it("returns null when the origin does not project", () => {
    expect(
      buildEngineCssViewMatrix({
        engine: createMockEngine(() => null),
        originECEF: new Vector3(),
        xAxisECEF: new Vector3(1, 0, 0),
        yAxisECEF: new Vector3(0, 1, 0),
      })
    ).toBeNull();
  });

  it("returns null for a degenerate axis pair or a destroyed engine", () => {
    expect(
      buildEngineCssViewMatrix({
        engine: createMockEngine(projectAffine),
        originECEF: new Vector3(),
        xAxisECEF: new Vector3(1, 0, 0),
        yAxisECEF: new Vector3(2, 0, 0),
      })
    ).toBeNull();
    expect(
      buildEngineCssViewMatrix({
        engine: createMockEngine(projectAffine, true),
        originECEF: new Vector3(),
        xAxisECEF: new Vector3(1, 0, 0),
        yAxisECEF: new Vector3(0, 1, 0),
      })
    ).toBeNull();
  });
});

describe("applyCssForward / applyCssInverse", () => {
  it("round-trips local coordinates through forward and inverse", () => {
    const result = buildEngineCssViewMatrix({
      engine: createMockEngine(projectAffine),
      originECEF: new Vector3(),
      xAxisECEF: new Vector3(1, 0, 0),
      yAxisECEF: new Vector3(0, 1, 0),
    })!;
    const delta = applyCssForward(result.forward, 4, -2);
    expect(delta.x).toBeCloseTo(8, 10);
    expect(delta.y).toBeCloseTo(6, 10);
    const local = applyCssInverse(result.inverse, delta.x, delta.y);
    expect(local.x).toBeCloseTo(4, 10);
    expect(local.y).toBeCloseTo(-2, 10);
  });
});
