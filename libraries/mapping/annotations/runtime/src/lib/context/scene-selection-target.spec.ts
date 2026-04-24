import { describe, expect, it } from "vitest";

import { resolveSceneSelectionTarget } from "./scene-selection-target";

describe("resolveRuntimeSceneSelectionTarget", () => {
  it("resolves polygon fill picks to the owning measurement id", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedObject: {
          id: {
            polygonGroupId: "area-1-fill",
          },
        },
        edgeMeasurementIdsById: new Map(),
        polygonFillMeasurementIdsById: new Map([["area-1-fill", "area-1"]]),
      })
    ).toEqual({
      isRuntimeTarget: true,
      measurementId: "area-1",
    });
  });

  it("keeps runtime-owned preview fills from clearing selection when they have no measurement id", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedObject: {
          id: {
            polygonGroupId: "preview-area-fill",
          },
        },
        edgeMeasurementIdsById: new Map(),
        polygonFillMeasurementIdsById: new Map([["preview-area-fill", null]]),
      })
    ).toEqual({
      isRuntimeTarget: true,
      measurementId: null,
    });
  });

  it("matches scene edge segment picks back to the owning measurement", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedObject: {
          id: "distance-1-vertical-0",
        },
        edgeMeasurementIdsById: new Map([
          ["distance-1-vertical", "distance-1"],
        ]),
        polygonFillMeasurementIdsById: new Map(),
      })
    ).toEqual({
      isRuntimeTarget: true,
      measurementId: "distance-1",
    });
  });

  it("matches scene edge picks from primitive ids back to the owning measurement", () => {
    expect(
      resolveSceneSelectionTarget({
        pickedObject: {
          primitive: {
            id: "polyline-1-segment-0",
          },
        },
        edgeMeasurementIdsById: new Map([["polyline-1-segment", "polyline-1"]]),
        polygonFillMeasurementIdsById: new Map(),
      })
    ).toEqual({
      isRuntimeTarget: true,
      measurementId: "polyline-1",
    });
  });
});
