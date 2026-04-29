import {
  setElevationReferenceAnnotationId,
  type StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { describe, expect, it, vi } from "vitest";

import { addPointMeasurement } from "./point-tool-actions";

const createPointMeasurement = (id: string): StoredAnnotation => ({
  id,
  toolType: "point",
  nodeIds: [`${id}-node`],
  edgeIds: [],
});

describe("point tool actions", () => {
  it("sets the first point measurement as elevation reference", () => {
    const annotation = createPointMeasurement("point-1");
    const dispatch = vi.fn();

    addPointMeasurement(
      "point",
      { latitude: 51, longitude: 7, altitude: 100 },
      null,
      {
        addAnnotation: vi.fn(() => annotation),
        state: {
          annotationToolType: "point",
          selectionState: {
            selectedAnnotationIds: [],
            previousSelectedAnnotationId: null,
          },
          annotationEntries: [],
          nodes: [],
          linkedNodeGroups: [],
          edges: [],
          infoBoxState: {
            activeAnnotationId: null,
          },
          settingsState: {
            pointTemporaryMode: false,
            elevationReferenceAnnotationId: null,
            nextShortLabelCounterByToolType: {},
          },
        },
        dispatch,
      }
    );

    expect(dispatch).toHaveBeenCalledWith(
      setElevationReferenceAnnotationId(annotation.id)
    );
  });

  it("keeps the current elevation reference when a point already exists", () => {
    const annotation = createPointMeasurement("point-2");
    const dispatch = vi.fn();

    addPointMeasurement(
      "point",
      { latitude: 51, longitude: 7, altitude: 100 },
      null,
      {
        addAnnotation: vi.fn(() => annotation),
        state: {
          annotationToolType: "point",
          selectionState: {
            selectedAnnotationIds: [],
            previousSelectedAnnotationId: null,
          },
          annotationEntries: [createPointMeasurement("point-1")],
          nodes: [],
          linkedNodeGroups: [],
          edges: [],
          infoBoxState: {
            activeAnnotationId: null,
          },
          settingsState: {
            pointTemporaryMode: false,
            elevationReferenceAnnotationId: "point-1",
            nextShortLabelCounterByToolType: {},
          },
        },
        dispatch,
      }
    );

    expect(dispatch).not.toHaveBeenCalledWith(
      setElevationReferenceAnnotationId(annotation.id)
    );
  });
});
