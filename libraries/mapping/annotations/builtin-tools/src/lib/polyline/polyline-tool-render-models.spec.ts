import { describe, expect, it, vi } from "vitest";

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

const build = (
  selectedAnnotationIds: readonly string[] = [],
  meterMarkers?: "always" | "selected" | "off",
  components?: "always" | "selected",
  endBadge = true
) =>
  buildPolylineToolRenderModels({
    toolType: "polyline",
    visuals: {
      ...visuals,
      ...(meterMarkers ? { meterMarkers } : {}),
      ...(components ? { components } : {}),
    },
    formatOptions: {
      lengthMeters: {},
    },
    labelTheme,
    getLabel: () => "P1",
    nodes,
    annotations: [annotation],
    selectedAnnotationIds,
    endBadge,
  });

describe("buildPolylineToolRenderModels", () => {
  it("anchors one label on the last node with the badge token and the length in one text by default", () => {
    const onNodeLongPress = vi.fn();
    const renderModels = buildPolylineToolRenderModels({
      toolType: "polyline",
      visuals,
      formatOptions: { lengthMeters: {} },
      labelTheme,
      getLabel: () => "P1",
      nodes,
      annotations: [annotation],
      selectedAnnotationIds: ["polyline-1"],
      onNodeLongPress,
    });

    expect(renderModels.pointLabels).toEqual([
      {
        id: "polyline-1-label",
        annotationId: "polyline-1",
        nodeId: "node-c",
        pointMarkerId: "polyline-1-node-2",
        coordinate: nodes[2]?.coordinate,
        markerPixelSize: expect.any(Number),
        markerOutlineWidth: expect.any(Number),
        content: expect.stringMatching(/^P1\s+\S+/),
        badgeContent: "P1",
        markerBackgroundColor: labelTheme.scheme.colorPrimary,
        markerTextColor: labelTheme.scheme.textColor,
        selected: true,
        onLongPress: expect.any(Function),
      },
    ]);

    renderModels.pointLabels[0]?.onLongPress?.();
    expect(onNodeLongPress).toHaveBeenCalledWith("node-c", "polyline-1");
    expect(renderModels.edges[0]).toMatchObject({
      overlayDashed: true,
      showSegmentLengthLabels: true,
    });
  });

  it("leaves the long press off the last-node label of a locked polyline", () => {
    const renderModels = buildPolylineToolRenderModels({
      toolType: "polyline",
      visuals,
      formatOptions: { lengthMeters: {} },
      labelTheme,
      getLabel: () => "P1",
      nodes,
      annotations: [{ ...annotation, locked: true }],
      selectedAnnotationIds: [],
      onNodeLongPress: vi.fn(),
    });

    expect(renderModels.pointLabels[0]?.onLongPress).toBeUndefined();
  });

  it("renders one badge that picks the screen-left end of the chain with the end badge", () => {
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
    // meter markers are on by default, selected or not
    expect(renderModels.edges[0]).toMatchObject({ ruler: true });
  });

  it("shows the meter markers only while selected in selected mode, never when off", () => {
    expect(build([], "selected").edges[0]).not.toHaveProperty("ruler");
    expect(build(["polyline-1"], "selected").edges[0]).toMatchObject({
      ruler: true,
    });
    expect(build(["polyline-1"], "off").edges[0]).not.toHaveProperty("ruler");
  });

  it("shows the segment length labels of an unselected line by default and in always mode", () => {
    expect(build().edges[0]).toMatchObject({ showSegmentLengthLabels: true });
    expect(build([], undefined, "always").edges[0]).toMatchObject({
      showSegmentLengthLabels: true,
    });
  });

  it("shows the segment length labels only while selected in selected components mode", () => {
    const unselected = build([], undefined, "selected");
    expect(unselected.edges[0]).not.toHaveProperty("showSegmentLengthLabels");
    // the total length stays on the badge
    expect(unselected.pointLabels[0]?.content).toMatch(/m$/);
    expect(build(["polyline-1"], undefined, "selected").edges[0]).toMatchObject(
      { showSegmentLengthLabels: true }
    );
  });

  it("keeps the components independent of the meter markers", () => {
    const edge = build([], "always", "selected").edges[0];

    expect(edge).toMatchObject({ ruler: true });
    expect(edge).not.toHaveProperty("showSegmentLengthLabels");
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
