import { describe, expect, it, vi } from "vitest";

import type { CesiumGeographicCoordinate } from "../store";
import type { RuntimePointMarkerRenderModel } from "./annotation-render-models";
import { buildVisualizerInputs } from "./visualizer-inputs";

const coordinate: CesiumGeographicCoordinate = {
  latitude: 51,
  longitude: 7,
  altitude: 0,
};

const buildPoint = ({
  id,
  annotationId,
  nodeId,
}: {
  id: string;
  annotationId: string;
  nodeId: string;
}): RuntimePointMarkerRenderModel => ({
  id,
  annotationId,
  nodeId,
  coordinate,
  pixelSize: 10,
  fill: "#ffffff",
  outline: "#000000",
  outlineWidth: 2,
});

const buildInputs = (
  overrides: Partial<Parameters<typeof buildVisualizerInputs>[0]> &
    Pick<Parameters<typeof buildVisualizerInputs>[0], "points">
) =>
  buildVisualizerInputs({
    pointLabels: [],
    selectedAnnotationIdSet: new Set<string>(),
    previewSnapTargetsEnabled: false,
    referenceNodeClickEnabled: false,
    referenceNodeHoverEnabled: false,
    nodeLinkIdByNodeId: new Map<string, string>(),
    previewNodeLinkId: null,
    isInPreviewNodeLink: () => false,
    enableHostInteractionTargets: true,
    ...overrides,
  });

describe("measurement visualizer node interaction inputs", () => {
  it("keeps preview snap clicks available on point markers", () => {
    const onNodeLongPress = vi.fn();
    const onPointClick = vi.fn();
    const onPointLongPress = vi.fn();
    const onPreviewSnapTargetNodeClick = vi.fn();
    const onReferenceNodeHover = vi.fn();
    const inputs = buildInputs({
      points: [
        {
          ...buildPoint({
            id: "point-a",
            annotationId: "measurement-a",
            nodeId: "node-a",
          }),
          onClick: onPointClick,
          onLongPress: onPointLongPress,
        },
      ],
      previewSnapTargetsEnabled: true,
      referenceNodeHoverEnabled: true,
      onNodeLongPress,
      onPreviewSnapTargetNodeClick,
      onReferenceNodeHover,
    });

    const point = inputs.visibleStandalonePoints[0];

    expect(inputs.pointLabels).toHaveLength(0);
    expect(point?.onClick).toEqual(expect.any(Function));
    expect(point?.onHoverChange).toEqual(expect.any(Function));
    expect(point?.onLongPress).toBeUndefined();

    point?.onHoverChange?.(true);
    point?.onClick?.();

    expect(onReferenceNodeHover).toHaveBeenCalledWith("node-a", true);
    expect(onPreviewSnapTargetNodeClick).toHaveBeenCalledWith("node-a");
    expect(onPointClick).not.toHaveBeenCalled();
    expect(onPointLongPress).not.toHaveBeenCalled();
    expect(onNodeLongPress).not.toHaveBeenCalled();
  });

  it("does not route visible stem label hover and click to preview snap while authoring", () => {
    const onLabelClick = vi.fn();
    const onLabelLongPress = vi.fn();
    const onPreviewSnapTargetNodeClick = vi.fn();
    const onReferenceNodeHover = vi.fn();
    const inputs = buildInputs({
      points: [],
      pointLabels: [
        {
          id: "distance-a-label",
          annotationId: "measurement-a",
          nodeId: "node-a",
          coordinate,
          content: "S",
          hideMarker: true,
          onClick: onLabelClick,
          onLongPress: onLabelLongPress,
        },
      ],
      previewSnapTargetsEnabled: true,
      referenceNodeHoverEnabled: true,
      onPreviewSnapTargetNodeClick,
      onReferenceNodeHover,
    });

    const label = inputs.pointLabels.find(
      (pointLabel) => pointLabel.id === "distance-a-label"
    );

    expect(label?.onClick).toBeUndefined();
    expect(label?.onHoverChange).toBeUndefined();
    expect(label?.onLongPress).toBeUndefined();
    expect(onReferenceNodeHover).not.toHaveBeenCalled();
    expect(onPreviewSnapTargetNodeClick).not.toHaveBeenCalled();
    expect(onLabelLongPress).not.toHaveBeenCalled();
  });

  it("routes reference node clicks when reference interactions are enabled", () => {
    const onReferenceNodeClick = vi.fn();
    const inputs = buildInputs({
      points: [
        buildPoint({
          id: "point-a",
          annotationId: "measurement-a",
          nodeId: "node-a",
        }),
      ],
      onReferenceNodeClick,
      referenceNodeClickEnabled: true,
    });

    const point = inputs.visibleStandalonePoints[0];

    expect(point?.onClick).toEqual(expect.any(Function));

    point?.onClick?.();

    expect(onReferenceNodeClick).toHaveBeenCalledWith("node-a");
  });

  it("keeps visible point label clicks ahead of reference node clicks", () => {
    const onLabelClick = vi.fn();
    const onReferenceNodeClick = vi.fn();
    const inputs = buildInputs({
      points: [],
      pointLabels: [
        {
          id: "distance-a-label",
          annotationId: "measurement-a",
          nodeId: "node-a",
          coordinate,
          content: "A",
          hideMarker: true,
          onClick: onLabelClick,
        },
      ],
      onReferenceNodeClick,
      referenceNodeClickEnabled: true,
    });

    const label = inputs.pointLabels.find(
      (pointLabel) => pointLabel.id === "distance-a-label"
    );

    expect(label?.onClick).toEqual(expect.any(Function));

    label?.onClick?.();

    expect(onLabelClick).toHaveBeenCalledTimes(1);
    expect(onReferenceNodeClick).not.toHaveBeenCalled();
  });

  it("selects all measurements sharing a node interaction target", () => {
    const onNodeAnnotationsSelect = vi.fn();
    const inputs = buildInputs({
      points: [
        buildPoint({
          id: "point-a",
          annotationId: "measurement-a",
          nodeId: "node-a",
        }),
        buildPoint({
          id: "point-b",
          annotationId: "measurement-b",
          nodeId: "node-b",
        }),
      ],
      nodeLinkIdByNodeId: new Map([
        ["node-a", "link-1"],
        ["node-b", "link-1"],
      ]),
      onNodeAnnotationsSelect,
    });

    const point = inputs.visibleStandalonePoints[0];

    expect(inputs.pointLabels).toHaveLength(0);
    expect(point?.onClick).toEqual(expect.any(Function));

    point?.onClick?.();

    expect(onNodeAnnotationsSelect).toHaveBeenCalledWith([
      "measurement-a",
      "measurement-b",
    ]);
  });

  it("adds node longpress handlers to visible standalone point markers", () => {
    const onNodeLongPress = vi.fn();
    const inputs = buildInputs({
      points: [
        buildPoint({
          id: "point-a",
          annotationId: "measurement-a",
          nodeId: "node-a",
        }),
      ],
      pointLabels: [],
      onNodeLongPress,
    });

    const point = inputs.visibleStandalonePoints[0];

    expect(point?.onLongPress).toEqual(expect.any(Function));

    point?.onLongPress?.();

    expect(onNodeLongPress).toHaveBeenCalledWith("node-a", "measurement-a");
  });

  it("does not add node longpress handlers when node editing is not allowed", () => {
    const onNodeLongPress = vi.fn();
    const inputs = buildInputs({
      points: [
        buildPoint({
          id: "point-a",
          annotationId: "measurement-a",
          nodeId: "node-a",
        }),
      ],
      pointLabels: [],
      onNodeLongPress,
      canStartNodeEditing: () => false,
    });

    expect(inputs.visibleStandalonePoints[0]?.onLongPress).toBeUndefined();
  });

  it("removes existing node longpress handlers when node editing is not allowed", () => {
    const onPointLongPress = vi.fn();
    const onLabelLongPress = vi.fn();
    const inputs = buildInputs({
      points: [
        {
          ...buildPoint({
            id: "point-a",
            annotationId: "measurement-a",
            nodeId: "node-a",
          }),
          onLongPress: onPointLongPress,
        },
      ],
      pointLabels: [
        {
          id: "label-a",
          annotationId: "measurement-a",
          nodeId: "node-a",
          coordinate,
          content: "Label",
          hideMarker: true,
          onLongPress: onLabelLongPress,
        },
      ],
      canStartNodeEditing: () => false,
    });

    expect(inputs.visibleStandalonePoints[0]?.onLongPress).toBeUndefined();
    expect(inputs.pointLabels[0]?.onLongPress).toBeUndefined();
  });

  it("removes point marker longpress when host interaction targets are disabled", () => {
    const inputs = buildInputs({
      points: [
        {
          ...buildPoint({
            id: "point-a",
            annotationId: "measurement-a",
            nodeId: "node-a",
          }),
          onLongPress: vi.fn(),
        },
      ],
      enableHostInteractionTargets: false,
    });

    expect(inputs.visibleStandalonePoints[0]?.onLongPress).toBeUndefined();
  });

  it("keeps longpress bound to the point node instead of replacing it with a selected linked node", () => {
    const onNodeLongPress = vi.fn();
    const inputs = buildInputs({
      points: [
        buildPoint({
          id: "point-a",
          annotationId: "measurement-a",
          nodeId: "node-a",
        }),
        buildPoint({
          id: "point-b",
          annotationId: "measurement-b",
          nodeId: "node-b",
        }),
      ],
      selectedAnnotationIdSet: new Set(["measurement-b"]),
      nodeLinkIdByNodeId: new Map([
        ["node-a", "link-1"],
        ["node-b", "link-1"],
      ]),
      onNodeLongPress,
    });

    const point = inputs.visibleStandalonePoints.find(
      (visiblePoint) => visiblePoint.id === "point-a"
    );

    expect(
      inputs.visibleStandalonePoints.map((visiblePoint) => visiblePoint.id)
    ).toEqual(["point-a", "point-b"]);

    point?.onLongPress?.();

    expect(onNodeLongPress).toHaveBeenCalledWith("node-a", "measurement-a");
  });

  it("removes normal label longpress while preview snap targets are enabled", () => {
    const onLongPress = vi.fn();
    const inputs = buildInputs({
      points: [],
      pointLabels: [
        {
          id: "label-a",
          annotationId: "measurement-a",
          nodeId: "node-a",
          coordinate,
          content: "Label",
          onLongPress,
        },
      ],
      previewSnapTargetsEnabled: true,
    });

    expect(inputs.pointLabels[0]?.onLongPress).toBeUndefined();
  });
});
