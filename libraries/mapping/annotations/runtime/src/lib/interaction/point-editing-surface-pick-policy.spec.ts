import { describe, expect, it } from "vitest";

import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import type { StoredAnnotation } from "../store";
import { shouldExcludeOwnGeometryFromPointEditSurfacePick } from "./point-editing-surface-pick-policy";

const annotation = (
  id: string,
  toolType: StoredAnnotation["toolType"]
): StoredAnnotation => ({
  id,
  toolType,
  nodeIds: ["edited"],
  edgeIds: [],
});

describe("point-editing surface-pick policy", () => {
  it.each([ANNOTATION_TYPES.POINT, ANNOTATION_TYPES.DISTANCE])(
    "excludes own geometry for selected %s measurements",
    (toolType) => {
      expect(
        shouldExcludeOwnGeometryFromPointEditSurfacePick({
          activeEditedNodeId: "edited",
          annotationEntries: [annotation("selected", toolType)],
          selectedAnnotationIds: ["selected"],
        })
      ).toBe(true);
    }
  );

  it.each([
    ANNOTATION_TYPES.POLYLINE,
    ANNOTATION_TYPES.AREA_GROUND,
    ANNOTATION_TYPES.AREA_PLANAR,
    ANNOTATION_TYPES.AREA_VERTICAL,
  ])("keeps own %s geometry available as a surface", (toolType) => {
    expect(
      shouldExcludeOwnGeometryFromPointEditSurfacePick({
        activeEditedNodeId: "edited",
        annotationEntries: [annotation("selected", toolType)],
        selectedAnnotationIds: ["selected"],
      })
    ).toBe(false);
  });

  it("does not apply a policy from an unselected annotation sharing the node", () => {
    expect(
      shouldExcludeOwnGeometryFromPointEditSurfacePick({
        activeEditedNodeId: "edited",
        annotationEntries: [
          annotation("unselected", ANNOTATION_TYPES.DISTANCE),
        ],
        selectedAnnotationIds: [],
      })
    ).toBe(false);
  });
});
