import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_ELEVATION_DISPLAY_MODES,
  ANNOTATION_DEFAULT_LABEL_THEME,
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
  annotations,
  selectedAnnotationIds = [],
  onLabelClick = vi.fn(),
}: {
  annotations: readonly StoredAnnotation[];
  selectedAnnotationIds?: readonly string[];
  onLabelClick?: ReturnType<typeof vi.fn>;
}) =>
  buildPointToolRenderModels({
    toolType: ANNOTATION_TYPE_POINT,
    visuals,
    labelTheme: ANNOTATION_DEFAULT_LABEL_THEME,
    formatOptions: {},
    getLabel: (counter) => `P${counter}`,
    nodes,
    annotations,
    elevationReferenceAnnotationId: null,
    selectedAnnotationIds,
    isSelectionAdditiveModifierPressed: false,
    onSelect: vi.fn(),
    onLabelClick,
    onLabelDoubleClick: vi.fn(),
  });

describe("buildPointToolRenderModels", () => {
  it("shows the first point annotation as NHN while it is the only point", () => {
    const pointLabels = buildModels({
      annotations: [createPointMeasurement("point-1", "node-1")],
    }).pointLabels;

    expect(String(pointLabels[0]?.content)).toContain("NHN");
  });

  it("uses relative elevation by default once a second point annotation exists", () => {
    const pointLabels = buildModels({
      annotations: [
        createPointMeasurement("point-1", "node-1"),
        createPointMeasurement("point-2", "node-2"),
      ],
    }).pointLabels;

    expect(String(pointLabels[0]?.content)).not.toContain("NHN");
    expect(String(pointLabels[1]?.content)).not.toContain("NHN");
  });

  it("keeps explicit elevation display mode overrides", () => {
    const pointLabels = buildModels({
      annotations: [
        createPointMeasurement("point-1", "node-1", {
          elevationDisplayMode: ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE,
        }),
        createPointMeasurement("point-2", "node-2"),
      ],
    }).pointLabels;

    expect(String(pointLabels[0]?.content)).toContain("NHN");
  });

  it("passes the effective display mode into the label toggle handler", () => {
    const onLabelClick = vi.fn();
    const pointLabels = buildModels({
      annotations: [createPointMeasurement("point-1", "node-1")],
      selectedAnnotationIds: ["point-1"],
      onLabelClick,
    }).pointLabels;

    pointLabels[0]?.onClick?.();

    expect(onLabelClick).toHaveBeenCalledWith(
      "point-1",
      ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE
    );
  });
});
