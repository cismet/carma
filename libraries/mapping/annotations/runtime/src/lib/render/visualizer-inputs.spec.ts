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
    activeMoveGizmoNodeId: null,
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
    const onPreviewSnapTargetNodeClick = vi.fn();
    const inputs = buildInputs({
      points: [
        buildPoint({
          id: "point-a",
          measurementId: "measurement-a",
          nodeId: "node-a",
        }),
      ],
      previewSnapTargetsEnabled: true,
      nodeInteractionHoverEnabled: true,
      onNodeLongPress,
      onPreviewSnapTargetNodeClick,
    });

    const interactionLabel = inputs.pointLabels.find(
      (label) => label.id === "point-a-node-interaction"
    );

    expect(interactionLabel?.allowClickWhenBlocked).toBe(true);
    expect(interactionLabel?.onClick).toEqual(expect.any(Function));
    expect(interactionLabel?.onLongPress).toBeUndefined();
    expect(inputs.visibleStandalonePoints[0]?.onLongPress).toBeUndefined();

    interactionLabel?.onClick?.();

    expect(onPreviewSnapTargetNodeClick).toHaveBeenCalledWith("node-a");
    expect(onNodeLongPress).not.toHaveBeenCalled();
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

    const interactionLabel = inputs.pointLabels.find(
      (label) => label.pointMarkerId === "point-a"
    );

    expect(inputs.pointLabels.map((label) => label.pointMarkerId)).toEqual([
      "point-a",
      "point-b",
    ]);

    interactionLabel?.onLongPress?.();

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
