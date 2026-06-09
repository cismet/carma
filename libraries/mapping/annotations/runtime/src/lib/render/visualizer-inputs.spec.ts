import { describe, expect, it, vi } from "vitest";

import type { CesiumGeographicCoordinate } from "../store";
import type { RuntimePointMarkerRenderModel } from "./measurement-render-models";
import { shouldShowNodeInteractionTargets } from "./node-interaction-targets";
import { buildVisualizerInputs } from "./visualizer-inputs";

const coordinate: CesiumGeographicCoordinate = {
  latitude: 51,
  longitude: 7,
  altitude: 0,
};

const buildPoint = ({
  id,
  measurementId,
  nodeId,
}: {
  id: string;
  measurementId: string;
  nodeId: string;
}): RuntimePointMarkerRenderModel => ({
  id,
  measurementId,
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
    showNodeInteractionTargets: true,
    nodeInteractionHoverEnabled: false,
    previewSnapTargetsEnabled: false,
    blockLabelInteractions: true,
    activeEditedNodeId: null,
    isMoveGizmoDragging: false,
    nodeLinkIdByNodeId: new Map<string, string>(),
    previewNodeLinkId: null,
    isInPreviewNodeLink: () => false,
    enableHostInteractionTargets: true,
    ...overrides,
  });

describe("measurement visualizer node interaction inputs", () => {
  it("keeps preview snap clicks available while dropping longpress in blocked authoring", () => {
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
            measurementId: "measurement-a",
            nodeId: "node-a",
          }),
          onClick: onPointClick,
          onLongPress: onPointLongPress,
        },
      ],
      previewSnapTargetsEnabled: true,
      nodeInteractionHoverEnabled: true,
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
          measurementId: "measurement-a",
          nodeId: "node-a",
          coordinate,
          content: "S",
          hideMarker: true,
          onClick: onLabelClick,
          onLongPress: onLabelLongPress,
        },
      ],
      previewSnapTargetsEnabled: true,
      nodeInteractionHoverEnabled: true,
      onPreviewSnapTargetNodeClick,
      onReferenceNodeHover,
    });

    const label = inputs.pointLabels.find(
      (pointLabel) => pointLabel.id === "distance-a-label"
    );

    expect(label?.allowClickWhenBlocked).toBeFalsy();
    expect(label?.onHoverChange).toBeUndefined();
    expect(label?.onLongPress).toBeUndefined();
    expect(onReferenceNodeHover).not.toHaveBeenCalled();
    expect(onPreviewSnapTargetNodeClick).not.toHaveBeenCalled();
    expect(onLabelLongPress).not.toHaveBeenCalled();
  });

  it("selects all measurements sharing a node interaction target", () => {
    const onNodeMeasurementsSelect = vi.fn();
    const inputs = buildInputs({
      points: [
        buildPoint({
          id: "point-a",
          measurementId: "measurement-a",
          nodeId: "node-a",
        }),
        buildPoint({
          id: "point-b",
          measurementId: "measurement-b",
          nodeId: "node-b",
        }),
      ],
      blockLabelInteractions: false,
      nodeLinkIdByNodeId: new Map([
        ["node-a", "link-1"],
        ["node-b", "link-1"],
      ]),
      onNodeMeasurementsSelect,
    });

    const point = inputs.visibleStandalonePoints[0];

    expect(inputs.pointLabels).toHaveLength(0);
    expect(point?.onClick).toEqual(expect.any(Function));

    point?.onClick?.();

    expect(onNodeMeasurementsSelect).toHaveBeenCalledWith([
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
          measurementId: "measurement-a",
          nodeId: "node-a",
        }),
      ],
      pointLabels: [],
      showNodeInteractionTargets: false,
      blockLabelInteractions: false,
      onNodeLongPress,
    });

    const point = inputs.visibleStandalonePoints[0];

    expect(point?.onLongPress).toEqual(expect.any(Function));

    point?.onLongPress?.();

    expect(onNodeLongPress).toHaveBeenCalledWith("node-a", "measurement-a");
  });

  it("removes point marker longpress when host interaction targets are disabled", () => {
    const inputs = buildInputs({
      points: [
        {
          ...buildPoint({
            id: "point-a",
            measurementId: "measurement-a",
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
          measurementId: "measurement-a",
          nodeId: "node-a",
        }),
        buildPoint({
          id: "point-b",
          measurementId: "measurement-b",
          nodeId: "node-b",
        }),
      ],
      selectedAnnotationIdSet: new Set(["measurement-b"]),
      blockLabelInteractions: false,
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

  it("does not leak normal label longpress while authoring blocks label interactions", () => {
    const onLongPress = vi.fn();
    const inputs = buildInputs({
      points: [],
      pointLabels: [
        {
          id: "label-a",
          measurementId: "measurement-a",
          nodeId: "node-a",
          coordinate,
          content: "Label",
          onLongPress,
        },
      ],
    });

    expect(inputs.pointLabels[0]?.onLongPress).toBeUndefined();
  });

  it("does not show longpress-only node interaction targets while authoring blocks normal label clicks", () => {
    expect(
      shouldShowNodeInteractionTargets({
        enableHostInteractionTargets: true,
        hasNodeInteractionHandlers: true,
        nodeInteractionHoverEnabled: false,
        nodeLongPressInteractionEnabled: true,
        blockLabelInteractions: true,
      })
    ).toBe(false);
  });

  it("does not show blocked click-only node interaction targets while authoring", () => {
    expect(
      shouldShowNodeInteractionTargets({
        enableHostInteractionTargets: true,
        hasNodeInteractionHandlers: true,
        nodeInteractionHoverEnabled: false,
        nodeLongPressInteractionEnabled: false,
        blockLabelInteractions: true,
      })
    ).toBe(false);
  });
});
