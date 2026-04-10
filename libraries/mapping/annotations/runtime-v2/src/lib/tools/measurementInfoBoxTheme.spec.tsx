import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
} from "@carma-mapping/annotations/core";
import { describe, expect, it, vi } from "vitest";

import { runtimeAnnotationInfoBoxVisualDefaults } from "../components/annotation-info-box/annotationInfoBoxVisualDefaults";
import type { RuntimeAnnotationInfoBoxContext } from "../components/annotation-info-box/annotationInfoBox.types";
import { resolveAnnotationMeasurementLabelTheme } from "../config/annotationMeasurementLabelThemes";
import type {
  RuntimeAnnotationEntry,
  RuntimeNode,
} from "../store/annotationsStore.types";
import { createDistanceToolInfoBoxSlots } from "./distance/distanceToolInfoBoxSlots";
import { createPointToolInfoBoxSlots } from "./point/pointToolInfoBoxSlots";

const createBaseContext = ({
  annotation,
  annotationEntries,
  nodes,
}: {
  annotation: RuntimeAnnotationEntry;
  annotationEntries: readonly RuntimeAnnotationEntry[];
  nodes: readonly RuntimeNode[];
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
  infoBoxVisualOptions: runtimeAnnotationInfoBoxVisualDefaults,
});

describe("measurement info box theme header colors", () => {
  it("uses the point measurement theme hue for the selected point info box header", () => {
    const labelTheme = resolveAnnotationMeasurementLabelTheme(
      ANNOTATION_TYPE_POINT
    );
    const getPointToolInfoBoxSlots = createPointToolInfoBoxSlots(
      ANNOTATION_TYPE_POINT,
      {
        headingTitle: "Punktmessung",
        headingColor: labelTheme.scheme.badgeBackgroundColor,
        formatMeasurementLabelToken: (counter) => `P${counter}`,
      }
    );
    const annotation: RuntimeAnnotationEntry = {
      id: "point-1",
      toolType: ANNOTATION_TYPE_POINT,
      nodeIds: ["node-1"],
      edgeIds: [],
    };
    const nodes: readonly RuntimeNode[] = [
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

    expect(slots?.headingColor).toBe(labelTheme.scheme.badgeBackgroundColor);
  });

  it("uses the distance measurement theme hue for the selected distance info box header", () => {
    const labelTheme = resolveAnnotationMeasurementLabelTheme(
      ANNOTATION_TYPE_DISTANCE
    );
    const getDistanceToolInfoBoxSlots = createDistanceToolInfoBoxSlots(
      ANNOTATION_TYPE_DISTANCE,
      {
        headingTitle: "Distanzmessung",
        headingColor: labelTheme.scheme.badgeBackgroundColor,
        formatMeasurementLabelToken: (counter) => `D${counter}`,
      }
    );
    const annotation: RuntimeAnnotationEntry = {
      id: "distance-1",
      toolType: ANNOTATION_TYPE_DISTANCE,
      nodeIds: ["node-1", "node-2"],
      edgeIds: [],
    };
    const nodes: readonly RuntimeNode[] = [
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

    expect(slots?.headingColor).toBe(labelTheme.scheme.badgeBackgroundColor);
  });
});
