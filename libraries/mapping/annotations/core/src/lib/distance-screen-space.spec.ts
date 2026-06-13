import { type CssPixelPosition } from "@carma-units";
import { describe, expect, it } from "vitest";

import {
  buildDistanceTriangleLineLabelReferences,
  buildOutsideReferencePoint2D,
  resolveOutsideReferencePoint2D,
} from "./distance-screen-space";

const point = (x: number, y: number): CssPixelPosition =>
  ({ x, y } as CssPixelPosition);

describe("distance screen-space label references", () => {
  it("places outside references opposite of the triangle interior", () => {
    const reference = resolveOutsideReferencePoint2D({
      start: point(0, 0),
      end: point(10, 0),
      insidePoint: point(5, 20),
      minDistancePx: 10,
      maxDistancePx: 10,
    });

    expect(reference).toEqual({
      outsideSign: -1,
      referencePoint: point(5, -10),
    });
    expect(
      buildOutsideReferencePoint2D(
        point(0, 0),
        point(10, 0),
        point(5, 20),
        10,
        10
      )
    ).toEqual(point(5, -10));
  });

  it("keeps the previous outside side while the interior is near the edge", () => {
    const reference = resolveOutsideReferencePoint2D({
      start: point(0, 0),
      end: point(10, 0),
      insidePoint: point(5, -1),
      previousOutsideSign: -1,
      flipThresholdPx: 4,
      minDistancePx: 10,
      maxDistancePx: 10,
    });

    expect(reference).toEqual({
      outsideSign: -1,
      referencePoint: point(5, -10),
    });
  });

  it("switches the outside side once the interior leaves the hysteresis band", () => {
    const reference = resolveOutsideReferencePoint2D({
      start: point(0, 0),
      end: point(10, 0),
      insidePoint: point(5, -8),
      previousOutsideSign: -1,
      flipThresholdPx: 4,
      minDistancePx: 10,
      maxDistancePx: 10,
    });

    expect(reference).toEqual({
      outsideSign: 1,
      referencePoint: point(5, 10),
    });
  });

  it("builds stable outside references for all distance triangle line labels", () => {
    const references = buildDistanceTriangleLineLabelReferences({
      anchor: point(0, 0),
      target: point(10, 0),
      aux: point(0, 10),
      anchorAltitudeMeters: 0,
      targetAltitudeMeters: 10,
      previousOutsideSigns: {
        direct: -1,
        horizontal: 1,
        vertical: 1,
      },
      flipThresholdPx: 4,
      referenceDistancePx: 10,
    });

    expect(references.directOutsideReferencePoint).toEqual(point(5, -10));
    expect(references.verticalOutsideReferencePoint).toEqual(point(-10, 5));
    expect(references.horizontalOutsideReferencePoint?.x).toBeCloseTo(
      12.071067811865476
    );
    expect(references.horizontalOutsideReferencePoint?.y).toBeCloseTo(
      12.071067811865476
    );
    expect(references.nextOutsideSigns).toEqual({
      direct: -1,
      horizontal: 1,
      vertical: 1,
    });
  });

  it("keeps distance triangle line label references at a constant distance", () => {
    const shortReferences = buildDistanceTriangleLineLabelReferences({
      anchor: point(0, 0),
      target: point(10, 0),
      aux: point(0, 10),
      anchorAltitudeMeters: 0,
      targetAltitudeMeters: 10,
    });
    const longReferences = buildDistanceTriangleLineLabelReferences({
      anchor: point(0, 0),
      target: point(100, 0),
      aux: point(0, 10),
      anchorAltitudeMeters: 0,
      targetAltitudeMeters: 10,
    });

    expect(shortReferences.directOutsideReferencePoint).toEqual(point(5, -24));
    expect(longReferences.directOutsideReferencePoint).toEqual(point(50, -24));
  });
});
