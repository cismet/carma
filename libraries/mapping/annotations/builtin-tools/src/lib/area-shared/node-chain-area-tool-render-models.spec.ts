import { describe, expect, it, vi } from "vitest";

import { RUNTIME_POLYGON_FILL_PLACEMENT } from "@carma-mapping/annotations/runtime";
import type {
  AnnotationNode,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { buildNodeChainAreaToolRenderModels } from "./node-chain-area-tool-render-models";

const nodes: readonly AnnotationNode[] = [
  {
    id: "node-a",
    coordinate: { longitude: 7, latitude: 51, altitude: 100 },
  },
  {
    id: "node-b",
    coordinate: { longitude: 7.0001, latitude: 51, altitude: 101 },
  },
  {
    id: "node-c",
    coordinate: { longitude: 7, latitude: 51.0001, altitude: 102 },
  },
];

const annotation: StoredAnnotation = {
  id: "area-1",
  toolType: "planar",
  nodeIds: ["node-a", "node-b", "node-c"],
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
  fill: "rgba(10, 20, 30, 0.2)",
  selectedFill: "rgba(10, 20, 30, 0.4)",
};

describe("buildNodeChainAreaToolRenderModels", () => {
  it("applies configured coplanar occlusion line and fill styles", () => {
    const renderModels = buildNodeChainAreaToolRenderModels({
      toolType: "area",
      visuals,
      nodes,
      annotations: [{ ...annotation, toolType: "area" }],
      selectedAnnotationIds: [],
      fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
      formatOptions: {},
      occlusionStyleOptions: {
        fill: {
          overlay: true,
          overlayAlphaMultiplier: 0.5,
        },
        line: {
          overlayDashed: true,
        },
      },
    });

    expect(renderModels.edges[0]).toMatchObject({
      overlayDashed: true,
    });
    expect(renderModels.edges[0]).not.toHaveProperty("dashed");
    expect(renderModels.polygonFills[0]?.overlayFill).toContain("0.1");
  });

  it("applies configured ground area line styles without overlay fills", () => {
    const renderModels = buildNodeChainAreaToolRenderModels({
      toolType: "planar",
      visuals,
      nodes,
      annotations: [annotation],
      selectedAnnotationIds: [],
      fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.GROUND,
      formatOptions: {},
      occlusionStyleOptions: {
        fill: {
          overlay: true,
          overlayAlphaMultiplier: 0.5,
        },
        line: {
          overlayDashed: true,
        },
      },
    });

    expect(renderModels.edges[0]).toMatchObject({
      overlayDashed: true,
    });
    expect(renderModels.edges[0]).not.toHaveProperty("dashed");
    expect(renderModels.polygonFills[0]?.overlayFill).toBeUndefined();
    expect(renderModels.polygonFills[0]?.placement).toBe(
      RUNTIME_POLYGON_FILL_PLACEMENT.GROUND
    );
  });

  it("wires area label long press to the last polygon node", () => {
    const onNodeLongPress = vi.fn();

    const renderModels = buildNodeChainAreaToolRenderModels({
      toolType: "planar",
      visuals,
      nodes,
      annotations: [annotation],
      selectedAnnotationIds: ["area-1"],
      fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
      formatOptions: {},
      onNodeLongPress,
    });

    renderModels.pointLabels[0]?.onLongPress?.();

    expect(renderModels.pointLabels[0]).toMatchObject({
      nodeId: "node-c",
      allowLongPressWhenBlocked: true,
    });
    expect(onNodeLongPress).toHaveBeenCalledWith("node-c", "area-1");
  });
});
