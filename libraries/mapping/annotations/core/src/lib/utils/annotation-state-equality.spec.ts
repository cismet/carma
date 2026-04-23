import { describe, expect, it } from "vitest";

import { ANNOTATION_TYPES } from "../types/annotation-types";
import { arePolygonAnnotationsEquivalent } from "./annotation-state-equality";

type ComparablePolygonAnnotation = Parameters<
  typeof arePolygonAnnotationsEquivalent
>[0];

const buildPolygonAnnotation = (
  overrides: Partial<ComparablePolygonAnnotation> = {}
): ComparablePolygonAnnotation => ({
  id: "area-1",
  type: ANNOTATION_TYPES.AREA_PLANAR,
  nodeIds: ["point-1", "point-2", "point-3"],
  edgeRelationIds: ["edge-1"],
  closed: true,
  planeLocked: true,
  ...overrides,
});

describe("annotationStateEquality", () => {
  it("treats base polygon annotations without derived geometry as equivalent", () => {
    expect(
      arePolygonAnnotationsEquivalent(
        buildPolygonAnnotation(),
        buildPolygonAnnotation()
      )
    ).toBe(true);
  });

  it("compares derived measurement fields when present", () => {
    expect(
      arePolygonAnnotationsEquivalent(
        buildPolygonAnnotation({
          perimeterMeters: 12,
          areaSquareMeters: 30,
          verticalityDeg: 0,
          bearingRad: Math.PI / 4,
        }),
        buildPolygonAnnotation({
          perimeterMeters: 13,
          areaSquareMeters: 30,
          verticalityDeg: 0,
          bearingRad: Math.PI / 4,
        })
      )
    ).toBe(false);
  });

  it("compares derived planar geometry when present", () => {
    const left = buildPolygonAnnotation({
      plane: {
        anchorECEF: { x: 1, y: 2, z: 3 },
        normalECEF: { x: 0, y: 0, z: 1 },
      },
      planarPolygonLocalFrame: {
        originECEF: { x: 1, y: 2, z: 3 },
        eastECEF: { x: 1, y: 0, z: 0 },
        northECEF: { x: 0, y: 1, z: 0 },
        upECEF: { x: 0, y: 0, z: 1 },
      },
      perimeterMeters: 12,
      areaSquareMeters: 30,
    });

    const right = buildPolygonAnnotation({
      ...left,
      plane: {
        anchorECEF: { x: 1.5, y: 2, z: 3 },
        normalECEF: { x: 0, y: 0, z: 1 },
      },
    });

    expect(arePolygonAnnotationsEquivalent(left, right)).toBe(false);
  });
});
