import { describe, expect, it, vi } from "vitest";

import {
  POINT_LABEL_ANCHOR_KIND,
  POINT_LABEL_STYLE,
} from "@carma-providers/label-overlay";
import {
  RUNTIME_POINT_LABEL_RENDER_STYLE,
  type AnnotationNode,
  type StoredAnnotation,
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

const annotation: StoredAnnotation = {
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
      [annotation],
      {
        visuals,
        formatOptions: {},
        selectedAnnotationIds: [],
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

  it("keeps the plain area label, with its long press while blocked, by default", () => {
    const onNodeLongPress = vi.fn();

    const renderModels = buildVerticalAreaToolRenderModels(
      "vertical",
      nodes,
      [annotation],
      {
        visuals,
        formatOptions: {},
        selectedAnnotationIds: ["vertical-1"],
        onNodeLongPress,
      }
    );

    expect(renderModels.pointLabels).toEqual([
      {
        id: "vertical-1-area-label",
        annotationId: "vertical-1",
        nodeId: "node-d",
        coordinate: expect.any(Object),
        anchorKind: POINT_LABEL_ANCHOR_KIND.AREA_CENTROID,
        content: expect.any(String),
        selected: true,
        hideMarker: true,
        collapse: false,
        renderStyle: RUNTIME_POINT_LABEL_RENDER_STYLE.LINE_BLEND,
        labelStyle: POINT_LABEL_STYLE.AUTO,
        allowLongPressWhenBlocked: true,
        onLongPress: expect.any(Function),
      },
    ]);
    expect(renderModels.pointLabels[0]).not.toHaveProperty("areaFit");

    renderModels.pointLabels[0]?.onLongPress?.();
    expect(onNodeLongPress).toHaveBeenCalledWith("node-d", "vertical-1");
  });

  it("wires area label long press to the last vertical area node and adds the pill twin with area label pills", () => {
    const onNodeLongPress = vi.fn();

    const renderModels = buildVerticalAreaToolRenderModels(
      "vertical",
      nodes,
      [annotation],
      {
        visuals,
        formatOptions: {},
        selectedAnnotationIds: ["vertical-1"],
        onNodeLongPress,
        areaLabelPills: true,
      }
    );

    renderModels.pointLabels[0]?.onLongPress?.();

    expect(renderModels.pointLabels[0]).toMatchObject({
      nodeId: "node-d",
      areaFit: { key: "vertical-1-area-label", role: "inside" },
    });
    expect(renderModels.pointLabels[0]).not.toHaveProperty(
      "allowLongPressWhenBlocked"
    );
    // the pill twin shows once the value no longer fits inside the area
    expect(renderModels.pointLabels[1]).toMatchObject({
      id: "vertical-1-area-label-pill",
      areaFit: { key: "vertical-1-area-label", role: "outside" },
    });
    expect(renderModels.pointLabels[1]?.nodeId).toBeUndefined();
    expect(onNodeLongPress).toHaveBeenCalledWith("node-d", "vertical-1");
  });
});
