import { describe, expect, it } from "vitest";

import { resolveSceneSelectionTarget } from "./scene-selection-target";

describe("resolveRuntimeSceneSelectionTarget", () => {
  it("resolves polygon fill picks to the owning measurement id", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedIds: ["area-1-fill"],
        edgeAnnotationIdsById: new Map(),
        polygonFillAnnotationIdsById: new Map([["area-1-fill", "area-1"]]),
      })
    ).toEqual({
      isRuntimeTarget: true,
      annotationId: "area-1",
    });
  });

  it("keeps runtime-owned preview fills from clearing selection when they have no measurement id", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedIds: ["preview-area-fill"],
        edgeAnnotationIdsById: new Map(),
        polygonFillAnnotationIdsById: new Map([["preview-area-fill", null]]),
      })
    ).toEqual({
      isRuntimeTarget: true,
      annotationId: null,
    });
  });

  it("matches scene edge segment picks back to the owning measurement", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedIds: ["distance-1-vertical-0"],
        edgeAnnotationIdsById: new Map([["distance-1-vertical", "distance-1"]]),
        polygonFillAnnotationIdsById: new Map(),
      })
    ).toEqual({
      isRuntimeTarget: true,
      annotationId: "distance-1",
    });
  });

  it("takes the nearest runtime-owned id when foreign ids are picked first", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedIds: ["foreign-primitive", "polyline-1-segment-0"],
        edgeAnnotationIdsById: new Map([["polyline-1-segment", "polyline-1"]]),
        polygonFillAnnotationIdsById: new Map(),
      })
    ).toEqual({
      isRuntimeTarget: true,
      annotationId: "polyline-1",
    });
  });

  it("clears the selection when nothing runtime-owned was picked", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedIds: ["foreign-primitive"],
        edgeAnnotationIdsById: new Map([["polyline-1-segment", "polyline-1"]]),
        polygonFillAnnotationIdsById: new Map(),
      })
    ).toEqual({
      isRuntimeTarget: false,
      annotationId: null,
    });
  });
});
