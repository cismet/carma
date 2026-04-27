import { describe, expect, it, vi } from "vitest";

import type {
  AnnotationNode,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { buildVerticalAreaToolRenderModels } from "./vertical-area-tool-render-models";

const nodes: readonly AnnotationNode[] = [
  {
    id: "node-a",
    coordinate: { longitude: 7, latitude: 51, altitude: 100 },
  },
  {
    id: "node-b",
    coordinate: { longitude: 7.0001, latitude: 51, altitude: 100 },
  },
  {
    id: "node-c",
    coordinate: { longitude: 7.0001, latitude: 51, altitude: 105 },
  },
  {
    id: "node-d",
    coordinate: { longitude: 7, latitude: 51, altitude: 105 },
  },
];

const measurement: StoredAnnotation = {
  id: "vertical-1",
  toolType: "vertical",
  nodeIds: ["node-a", "node-b", "node-c", "node-d"],
  edgeIds: [],
  closed: true,
};

const visuals = {
  edge: {
    stroke: "rgba(255, 255, 255, 0.92)",
    strokeWidth: 1.5,
  },
  point: {
    pixelSize: 10,
    fill: "rgba(0, 0, 0, 0)",
    outline: "rgba(255, 255, 255, 0.92)",
    outlineWidth: 1,
  },
};

describe("buildVerticalAreaToolRenderModels", () => {
  it("applies configured occlusion line and fill styles", () => {
    const renderModels = buildVerticalAreaToolRenderModels(
      "vertical",
      nodes,
      [measurement],
      {
        visuals,
        formatOptions: {},
        selectedMeasurementIds: [],
        occlusionStyleOptions: {
          fill: {
            overlay: true,
            overlayAlphaMultiplier: 0.5,
          },
          line: {
            overlayDashed: true,
          },
        },
      }
    );

    expect(renderModels.edges[0]).toMatchObject({
      overlayDashed: true,
    });
    expect(renderModels.edges[0]).not.toHaveProperty("dashed");
    expect(renderModels.polygonFills[0]?.overlayFill).toBeDefined();
  });

  it("wires area label long press to the last vertical area node", () => {
    const onNodeLongPress = vi.fn();

    const renderModels = buildVerticalAreaToolRenderModels(
      "vertical",
      nodes,
      [measurement],
      {
        visuals,
        formatOptions: {},
        selectedMeasurementIds: ["vertical-1"],
        onNodeLongPress,
      }
    );

    renderModels.pointLabels[0]?.onLongPress?.();

    expect(renderModels.pointLabels[0]).toMatchObject({
      nodeId: "node-d",
      allowLongPressWhenBlocked: true,
    });
    expect(onNodeLongPress).toHaveBeenCalledWith("node-d", "vertical-1");
  });
});
