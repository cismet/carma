import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { annotationInfoBoxVisualDefaults } from "@carma-mapping/annotations/ui";
import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeAnnotationInfoBoxContext } from "@carma-mapping/annotations/runtime";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "@carma-mapping/annotations/runtime";
import type {
  StoredAnnotation,
  AnnotationNode,
} from "@carma-mapping/annotations/runtime";
import { createDistanceToolInfoBoxSlots } from "./distance/distance-tool-info-box-slots";
import { createPointToolInfoBoxSlots } from "./point/point-tool-info-box-slots";
const { DISTANCE: ANNOTATION_TYPE_DISTANCE, POINT: ANNOTATION_TYPE_POINT } =
  ANNOTATION_TYPES;

const createBaseContext = ({
  annotation,
  annotationEntries,
  nodes,
}: {
  annotation: StoredAnnotation;
  annotationEntries: readonly StoredAnnotation[];
  nodes: readonly AnnotationNode[];
}): RuntimeAnnotationInfoBoxContext => ({
  annotation,
  annotationEntries,
  nodes,
  selectedAnnotationId: annotation.id,
  setSelectedAnnotationId: vi.fn(),
  focusAnnotationId: vi.fn(),
  flyToAllAnnotations: vi.fn(),
  removeAnnotationById: vi.fn(),
  elevationReferenceAnnotationId: null,
  setElevationReferenceAnnotationId: vi.fn(),
  updateAnnotationDisplayName: vi.fn(),
  updateAnnotationShortLabel: vi.fn(),
  formatOptions: {},
  infoBoxVisualOptions: annotationInfoBoxVisualDefaults,
});

describe("measurement info box theme header colors", () => {
  it("uses the shared measurement theme hue for the selected point info box header", () => {
    const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
    const getPointToolInfoBoxSlots = createPointToolInfoBoxSlots(
      ANNOTATION_TYPE_POINT,
      {
        headingTitle: "Punktmessung",
        headingColor: labelTheme.scheme.colorPrimary,
        formatMeasurementLabelToken: (counter) => `P${counter}`,
      }
    );
    const annotation: StoredAnnotation = {
      id: "point-1",
      toolType: ANNOTATION_TYPE_POINT,
      nodeIds: ["node-1"],
      edgeIds: [],
    };
    const nodes: readonly AnnotationNode[] = [
      {
        id: "node-1",
        coordinate: { latitude: 51.0, longitude: 7.0, altitude: 123.4 },
      },
    ];

    const slots = getPointToolInfoBoxSlots(
      createBaseContext({
        annotation,
        annotationEntries: [annotation],
        nodes,
      })
    );

    expect(slots?.headingColor).toBe(labelTheme.scheme.colorPrimary);
  });

  it("uses the shared measurement theme hue for the selected distance info box header", () => {
    const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
    const getDistanceToolInfoBoxSlots = createDistanceToolInfoBoxSlots(
      ANNOTATION_TYPE_DISTANCE,
      {
        headingTitle: "Distanzmessung",
        headingColor: labelTheme.scheme.colorPrimary,
        formatMeasurementLabelToken: (counter) => `D${counter}`,
        metricLabels: {
          direct: "Direkt",
          horizontal: "Horizontal",
          vertical: "Vertikal",
        },
      }
    );
    const annotation: StoredAnnotation = {
      id: "distance-1",
      toolType: ANNOTATION_TYPE_DISTANCE,
      nodeIds: ["node-1", "node-2"],
      edgeIds: [],
    };
    const nodes: readonly AnnotationNode[] = [
      {
        id: "node-1",
        coordinate: { latitude: 51.0, longitude: 7.0, altitude: 123.4 },
      },
      {
        id: "node-2",
        coordinate: { latitude: 51.0001, longitude: 7.0001, altitude: 124.1 },
      },
    ];

    const slots = getDistanceToolInfoBoxSlots(
      createBaseContext({
        annotation,
        annotationEntries: [annotation],
        nodes,
      })
    );

    expect(slots?.headingColor).toBe(labelTheme.scheme.colorPrimary);
  });

  it("does not add extra bottom padding below the distance metric grid content", () => {
    const getDistanceToolInfoBoxSlots = createDistanceToolInfoBoxSlots(
      ANNOTATION_TYPE_DISTANCE,
      {
        headingTitle: "Distanzmessung",
        headingColor: "#ffffff",
        formatMeasurementLabelToken: (counter) => `D${counter}`,
        metricLabels: {
          direct: "Direkt",
          horizontal: "Horizontal",
          vertical: "Vertikal",
        },
      }
    );
    const annotation: StoredAnnotation = {
      id: "distance-1",
      toolType: ANNOTATION_TYPE_DISTANCE,
      nodeIds: ["node-1", "node-2"],
      edgeIds: [],
    };
    const nodes: readonly AnnotationNode[] = [
      {
        id: "node-1",
        coordinate: { latitude: 51.0, longitude: 7.0, altitude: 123.4 },
      },
      {
        id: "node-2",
        coordinate: { latitude: 51.0001, longitude: 7.0001, altitude: 124.1 },
      },
    ];

    const slots = getDistanceToolInfoBoxSlots(
      createBaseContext({
        annotation,
        annotationEntries: [annotation],
        nodes,
      })
    );

    expect(isValidElement(slots?.content)).toBe(true);
    if (!isValidElement(slots?.content)) {
      return;
    }

    expect(slots.content.props.style).toMatchObject({
      paddingBottom: 0,
    });
  });
});
