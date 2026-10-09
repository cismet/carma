import { describe, expect, it } from "vitest";

import {
  ANNOTATION_DEFAULT_LABEL_THEME,
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  type AnnotationNode,
  type StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { buildPolylineToolRenderModels } from "./polyline-tool-render-models";

const visuals = {
  edge: {
    stroke: "rgba(255, 255, 255, 0.92)",
    strokeWidth: 1.5,
  },
  selectedEdge: {
    stroke: "rgba(255, 214, 10, 0.98)",
    strokeWidth: 1.5,
  },
  previewEdge: {
    stroke: "rgba(255, 255, 255, 0.9)",
    strokeWidth: 1.5,
  },
  point: {
    pixelSize: 10,
    fill: "rgba(0, 0, 0, 0)",
    outline: "rgba(255, 255, 255, 0.92)",
    outlineWidth: 1,
  },
  selectedPoint: {
    pixelSize: 10,
    fill: "rgba(0, 0, 0, 0)",
    outline: "rgba(255, 214, 10, 0.98)",
    outlineWidth: 1,
  },
  previewPoint: {
    pixelSize: 10,
    fill: "rgba(255, 255, 255, 0.88)",
    outline: "rgba(255, 255, 255, 0.92)",
    outlineWidth: 1,
  },
};

const labelTheme = ANNOTATION_DEFAULT_LABEL_THEME;

const nodes: readonly AnnotationNode[] = [
  {
    id: "node-a",
    coordinate: {
      latitude: 51,
      longitude: 7,
      altitude: 100,
    },
  },
  {
    id: "node-b",
    coordinate: {
      latitude: 51.0001,
      longitude: 7.0001,
      altitude: 101,
    },
  },
  {
    id: "node-c",
    coordinate: {
      latitude: 51.0002,
      longitude: 7.0002,
      altitude: 102,
    },
  },
];

const annotation: StoredAnnotation = {
  id: "polyline-1",
  toolType: "polyline",
  nodeIds: ["node-a", "node-b", "node-c"],
  edgeIds: [],
  shortLabel: "P1",
};

const build = (selectedAnnotationIds: readonly string[] = []) =>
  buildPolylineToolRenderModels({
    toolType: "polyline",
    visuals,
    formatOptions: {
      lengthMeters: {},
    },
    labelTheme,
    getLabel: () => "P1",
    nodes,
    annotations: [annotation],
    selectedAnnotationIds,
  });

describe("buildPolylineToolRenderModels", () => {
  it("renders one badge that picks the screen-left end of the chain", () => {
    const renderModels = build();

    expect(renderModels.pointLabels).toHaveLength(1);
    expect(renderModels.pointLabels[0]).toMatchObject({
      id: "polyline-1-label",
      nodeId: "node-a",
      coordinateSelection:
        RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE,
      preferredAttach: "right",
      badgeContent: "P1",
      hideMarker: true,
      textBackgroundColor: labelTheme.scheme.colorPrimaryReduced,
      selectedGlowColor: labelTheme.selection.glowColor,
    });
    expect(
      renderModels.pointLabels[0]?.coordinateCandidates?.map(
        (candidate) => candidate.nodeId
      )
    ).toEqual(["node-a", "node-c"]);
    expect(renderModels.edges[0]).toMatchObject({
      id: "polyline-1",
      overlayDashed: true,
      showSegmentLengthLabels: true,
    });
    expect(renderModels.edges[0]).not.toHaveProperty("dashed");
    expect(renderModels.edges[0]).not.toHaveProperty("ruler");
  });

  it("shows the total length next to the badge without repeating the badge token", () => {
    const content = build().pointLabels[0]?.content;

    expect(typeof content).toBe("string");
    expect(content).not.toMatch(/P1/);
    expect(content).toMatch(/m$/);
  });

  it("carries the ruler and the selection highlight while selected", () => {
    const renderModels = build(["polyline-1"]);

    expect(renderModels.edges[0]).toMatchObject({ ruler: true });
    expect(renderModels.pointLabels[0]).toMatchObject({ selected: true });
  });
});
