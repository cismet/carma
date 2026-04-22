import { describe, expect, it } from "vitest";

import type {
  AnnotationNode,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { buildPolylineToolRenderModels } from "./polyline-tool-render-models";

const visuals = {
  edge: {
    stroke: "rgba(255, 255, 255, 0.92)",
    strokeWidth: 1,
  },
  selectedEdge: {
    stroke: "rgba(255, 214, 10, 0.98)",
    strokeWidth: 1,
  },
  previewEdge: {
    stroke: "rgba(255, 255, 255, 0.9)",
    strokeWidth: 1,
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

const badgeStyle = {
  backgroundColor: "rgba(75, 85, 99, 1)",
  textColor: "rgba(248, 250, 252, 0.98)",
};

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

const measurement: StoredAnnotation = {
  id: "polyline-1",
  toolType: "polyline",
  nodeIds: ["node-a", "node-b", "node-c"],
  edgeIds: [],
  shortLabel: "P1",
};

describe("buildPolylineToolRenderModels", () => {
  it("renders a single label anchored on the last node of the polyline", () => {
    const renderModels = buildPolylineToolRenderModels({
      toolType: "polyline",
      visuals,
      formatOptions: {
        lengthMeters: {},
      },
      badgeStyle,
      getMeasurementLabel: () => "P1",
      nodes,
      measurements: [measurement],
      selectedMeasurementIds: [],
    });

    expect(renderModels.pointLabels).toHaveLength(1);
    expect(renderModels.pointLabels[0]).toMatchObject({
      id: "polyline-1-label",
      nodeId: "node-c",
      pointMarkerId: "polyline-1-node-2",
      badgeContent: "P1",
    });
    expect(renderModels.pointLabels[0]?.content).toMatch(/^P1\s+/);
    expect(renderModels.edges[0]).toMatchObject({
      id: "polyline-1",
      showSegmentLengthLabels: true,
    });
  });

  it("adds the total length to the extended end label while keeping the badge token", () => {
    const renderModels = buildPolylineToolRenderModels({
      toolType: "polyline",
      visuals,
      formatOptions: {
        lengthMeters: {},
      },
      badgeStyle,
      getMeasurementLabel: () => "P1",
      nodes,
      measurements: [measurement],
      selectedMeasurementIds: [],
    });

    expect(renderModels.pointLabels[0]).toMatchObject({
      badgeContent: "P1",
    });
    expect(renderModels.pointLabels[0]?.content).not.toBe("P1");
  });
});
