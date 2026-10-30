import { describe, expect, it, vi } from "vitest";

import {
  POINT_LABEL_ANCHOR_KIND,
  POINT_LABEL_STYLE,
} from "@carma-providers/label-overlay";
import { RUNTIME_POINT_LABEL_RENDER_STYLE } from "@carma-mapping/annotations/runtime";
import {
  defaultAnnotationAreaPalette,
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationNode,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import {
  buildNodeChainAreaToolRenderModels,
  createNodeChainAreaToolVisuals,
} from "./node-chain-area-tool-render-models";
import { resolveAreaLabelPillColors } from "./area-value-labels";

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

const createAreaLabelPillColors = () =>
  resolveAreaLabelPillColors(defaultAnnotationAreaPalette, "planar");

describe("buildNodeChainAreaToolRenderModels", () => {
  it("applies configured coplanar occlusion line and fill styles", () => {
    const renderModels = buildNodeChainAreaToolRenderModels({
      toolType: "area",
      visuals,
      nodes,
      annotations: [{ ...annotation, toolType: "area" }],
      selectedAnnotationIds: [],
      fillPlacement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR,
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
      fillPlacement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND,
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
      ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND
    );
  });

  it("keeps the plain area label, with its long press while blocked, by default", () => {
    const onNodeLongPress = vi.fn();

    const renderModels = buildNodeChainAreaToolRenderModels({
      toolType: "planar",
      visuals,
      nodes,
      annotations: [annotation],
      selectedAnnotationIds: ["area-1"],
      fillPlacement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR,
      formatOptions: {},
      onNodeLongPress,
    });

    expect(renderModels.pointLabels).toEqual([
      {
        id: "area-1-area-label",
        annotationId: "area-1",
        nodeId: "node-c",
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
    expect(onNodeLongPress).toHaveBeenCalledWith("node-c", "area-1");
  });

  it("wires area label long press to the last polygon node and adds the pill twin with area label pills", () => {
    const onNodeLongPress = vi.fn();

    const renderModels = buildNodeChainAreaToolRenderModels({
      toolType: "planar",
      visuals: {
        ...visuals,
        areaLabelPill: createAreaLabelPillColors(),
      },
      nodes,
      annotations: [annotation],
      selectedAnnotationIds: ["area-1"],
      fillPlacement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR,
      formatOptions: {},
      onNodeLongPress,
    });

    renderModels.pointLabels[0]?.onLongPress?.();

    expect(renderModels.pointLabels[0]).toMatchObject({
      nodeId: "node-c",
      areaFit: { key: "area-1-area-label", role: "inside" },
    });
    expect(renderModels.pointLabels[0]).not.toHaveProperty(
      "allowLongPressWhenBlocked"
    );
    // the pill twin shows once the value no longer fits inside the area
    expect(renderModels.pointLabels[1]).toMatchObject({
      id: "area-1-area-label-pill",
      areaFit: { key: "area-1-area-label", role: "outside" },
    });
    expect(renderModels.pointLabels[1]?.nodeId).toBeUndefined();
    expect(onNodeLongPress).toHaveBeenCalledWith("node-c", "area-1");
  });

  it("only creates the pill colours of the visuals with area label pills", () => {
    const options = { fillType: "planar" as const };

    expect(createNodeChainAreaToolVisuals(options)).not.toHaveProperty(
      "areaLabelPill"
    );
    expect(
      createNodeChainAreaToolVisuals({ ...options, areaLabelPills: true })
    ).toHaveProperty("areaLabelPill");
  });
});
