import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_ELEVATION_DISPLAY_MODES,
  ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME,
  type AnnotationNode,
  type StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { describe, expect, it, vi } from "vitest";

import { buildPointToolRenderModels } from "./point-tool-render-models";

const { POINT: ANNOTATION_TYPE_POINT } = ANNOTATION_TYPES;

const visuals = {
  point: {
    pixelSize: 10,
    fill: "rgba(0, 0, 0, 0)",
    outline: "rgba(255, 255, 255, 0.92)",
    outlineWidth: 1,
  },
};

const nodes: readonly AnnotationNode[] = [
  {
    id: "node-1",
    coordinate: {
      latitude: 51,
      longitude: 7,
      altitude: 100,
    },
  },
  {
    id: "node-2",
    coordinate: {
      latitude: 51.0001,
      longitude: 7.0001,
      altitude: 110,
    },
  },
];

const createPointMeasurement = (
  id: string,
  nodeId: string,
  overrides: Partial<StoredAnnotation> = {}
): StoredAnnotation => ({
  id,
  toolType: ANNOTATION_TYPE_POINT,
  nodeIds: [nodeId],
  edgeIds: [],
  ...overrides,
});

const buildModels = ({
  measurements,
  selectedMeasurementIds = [],
  onMeasurementLabelClick = vi.fn(),
}: {
  measurements: readonly StoredAnnotation[];
  selectedMeasurementIds?: readonly string[];
  onMeasurementLabelClick?: ReturnType<typeof vi.fn>;
}) =>
  buildPointToolRenderModels({
    toolType: ANNOTATION_TYPE_POINT,
    visuals,
    labelTheme: ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME,
    formatOptions: {},
    getMeasurementLabel: (counter) => `P${counter}`,
    nodes,
    measurements,
    elevationReferenceAnnotationId: null,
    selectedMeasurementIds,
    isSelectionAdditiveModifierPressed: false,
    onMeasurementSelect: vi.fn(),
    onMeasurementLabelClick,
    onMeasurementLabelDoubleClick: vi.fn(),
  });

describe("buildPointToolRenderModels", () => {
  it("shows the first point measurement as NHN while it is the only point", () => {
    const pointLabels = buildModels({
      measurements: [createPointMeasurement("point-1", "node-1")],
    }).pointLabels;

    expect(String(pointLabels[0]?.content)).toContain("NHN");
  });

  it("uses relative elevation by default once a second point measurement exists", () => {
    const pointLabels = buildModels({
      measurements: [
        createPointMeasurement("point-1", "node-1"),
        createPointMeasurement("point-2", "node-2"),
      ],
    }).pointLabels;

    expect(String(pointLabels[0]?.content)).not.toContain("NHN");
    expect(String(pointLabels[1]?.content)).not.toContain("NHN");
  });

  it("keeps explicit elevation display mode overrides", () => {
    const pointLabels = buildModels({
      measurements: [
        createPointMeasurement("point-1", "node-1", {
          elevationDisplayMode: ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE,
        }),
        createPointMeasurement("point-2", "node-2"),
      ],
    }).pointLabels;

    expect(String(pointLabels[0]?.content)).toContain("NHN");
  });

  it("passes the effective display mode into the label toggle handler", () => {
    const onMeasurementLabelClick = vi.fn();
    const pointLabels = buildModels({
      measurements: [createPointMeasurement("point-1", "node-1")],
      selectedMeasurementIds: ["point-1"],
      onMeasurementLabelClick,
    }).pointLabels;

    pointLabels[0]?.onClick?.();

    expect(onMeasurementLabelClick).toHaveBeenCalledWith(
      "point-1",
      ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE
    );
  });
});
