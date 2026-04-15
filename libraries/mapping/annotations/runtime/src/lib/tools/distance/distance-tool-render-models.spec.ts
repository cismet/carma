import { describe, expect, it } from "vitest";

import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../../render/measurement-render-models";
import type {
  RuntimeEdge,
  RuntimeNodeLink,
  RuntimeMeasurement,
  RuntimeNode,
} from "../../store";
import { buildDistanceToolRenderModels } from "./distance-tool-render-models";
import type { DistanceToolVisualSettings } from "./distance-tool-settings";
import type { AnnotationMeasurementLabelTheme } from "../../config/annotation-measurement-label-themes";

const visuals: DistanceToolVisualSettings = {
  edge: {
    stroke: "rgba(255, 255, 255, 0.92)",
    strokeWidth: 1.5,
    dashed: true,
  },
  selectedEdge: {
    stroke: "rgba(255, 214, 10, 0.98)",
    strokeWidth: 1.5,
    dashed: true,
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

const labelTheme: AnnotationMeasurementLabelTheme = {
  scheme: {
    id: "default",
    label: "Default",
    colorPrimaryReduced: "rgba(30, 41, 59, 0.62)",
    colorPrimary: "rgba(75, 85, 99, 1)",
    lineColor: "rgba(255, 255, 255, 0.88)",
    textColor: "rgba(248, 250, 252, 0.98)",
  },
  fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
  contentFontWeight: 500,
  badgeFontWeight: 500,
  selection: {
    backgroundColor: "rgba(71, 85, 105, 0.74)",
    hoverBackgroundColor: "rgba(51, 65, 85, 0.68)",
    textColor: "rgba(248, 250, 252, 0.98)",
    glowColor: "rgba(253, 224, 71, 0.99)",
    glowRadiusPx: 5,
    preserveFillOnSelection: false,
  },
};

const nodes: readonly RuntimeNode[] = [
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
      altitude: 100,
    },
  },
  {
    id: "node-c",
    coordinate: {
      latitude: 51.0002,
      longitude: 7.0002,
      altitude: 100,
    },
  },
  {
    id: "node-d",
    coordinate: {
      latitude: 51.0003,
      longitude: 7.0003,
      altitude: 100,
    },
  },
  {
    id: "node-e",
    coordinate: {
      latitude: 51.0004,
      longitude: 7.0004,
      altitude: 100,
    },
  },
];

const primaryMeasurement: RuntimeMeasurement = {
  id: "distance-1",
  toolType: "distance",
  nodeIds: ["node-a", "node-b"],
  edgeIds: [],
  shortLabel: "D1",
  distanceAnchorCoordinateSelection:
    RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE,
};

const getBadgeLabel = ({
  linkedNodeGroups,
  measurements = [primaryMeasurement],
  edges = [],
}: {
  linkedNodeGroups: readonly RuntimeNodeLink[];
  measurements?: readonly RuntimeMeasurement[];
  edges?: readonly RuntimeEdge[];
}) =>
  buildDistanceToolRenderModels({
    toolType: "distance",
    visuals,
    labelTheme,
    getMeasurementLabel: () => "D1",
    nodes,
    edges,
    linkedNodeGroups,
    measurements,
    selectedMeasurementIds: [],
  }).pointLabels.find((label) => label.id === "distance-1-label");

describe("buildDistanceToolRenderModels", () => {
  it("does not emit duplicate hidden node-interaction labels because the host owns those targets", () => {
    const pointLabels = buildDistanceToolRenderModels({
      toolType: "distance",
      visuals,
      labelTheme,
      getMeasurementLabel: () => "D1",
      nodes,
      edges: [
        {
          id: "edge-1",
          startNodeId: "node-a",
          endNodeId: "node-b",
        },
      ],
      linkedNodeGroups: [
        { id: "node-a", nodeIds: ["node-a"] },
        { id: "node-b", nodeIds: ["node-b"] },
      ],
      measurements: [primaryMeasurement],
      selectedMeasurementIds: [],
    }).pointLabels;

    expect(pointLabels.map((label) => label.id)).toEqual(["distance-1-label"]);
  });

  it("keeps the existing distance badge candidate pair for unlinked endpoints", () => {
    const badgeLabel = getBadgeLabel({
      linkedNodeGroups: [
        { id: "node-a", nodeIds: ["node-a"] },
        { id: "node-b", nodeIds: ["node-b"] },
      ],
      edges: [
        {
          id: "edge-1",
          startNodeId: "node-a",
          endNodeId: "node-b",
        },
      ],
    });

    expect(badgeLabel?.nodeId).toBe("node-b");
    expect(badgeLabel?.preferredAttach).toBe("left");
    expect(badgeLabel?.coordinateCandidates).toHaveLength(2);
  });

  it("anchors the distance badge on the endpoint with fewer incident edges at the linked position", () => {
    const secondaryMeasurement: RuntimeMeasurement = {
      id: "distance-2",
      toolType: "distance",
      nodeIds: ["node-c", "node-e"],
      edgeIds: [],
      shortLabel: "D2",
      distanceAnchorCoordinateSelection:
        RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE,
    };
    const badgeLabel = getBadgeLabel({
      linkedNodeGroups: [
        { id: "shared-start", nodeIds: ["node-a", "node-c"] },
        { id: "shared-end", nodeIds: ["node-b", "node-d"] },
        { id: "node-e", nodeIds: ["node-e"] },
      ],
      measurements: [primaryMeasurement, secondaryMeasurement],
      edges: [
        {
          id: "edge-1",
          startNodeId: "node-a",
          endNodeId: "node-b",
        },
        {
          id: "edge-2",
          startNodeId: "node-c",
          endNodeId: "node-e",
        },
      ],
    });

    expect(badgeLabel?.nodeId).toBe("node-b");
    expect(badgeLabel?.preferredAttach).toBeUndefined();
    expect(badgeLabel?.coordinateCandidates).toEqual([
      {
        coordinate: nodes[1]?.coordinate,
        nodeId: "node-b",
      },
    ]);
  });

  it("uses linked group size as a secondary tiebreaker when incident edge counts match", () => {
    const badgeLabel = getBadgeLabel({
      linkedNodeGroups: [
        { id: "crowded-start", nodeIds: ["node-a", "node-c", "node-d"] },
        { id: "lighter-end", nodeIds: ["node-b", "node-e"] },
      ],
      edges: [
        {
          id: "edge-1",
          startNodeId: "node-a",
          endNodeId: "node-b",
        },
      ],
    });

    expect(badgeLabel?.nodeId).toBe("node-b");
    expect(badgeLabel?.preferredAttach).toBeUndefined();
    expect(badgeLabel?.coordinateCandidates).toEqual([
      {
        coordinate: nodes[1]?.coordinate,
        nodeId: "node-b",
      },
    ]);
  });
});
