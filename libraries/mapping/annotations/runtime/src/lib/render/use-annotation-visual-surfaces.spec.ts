import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAnnotationVisualizersMock = vi.fn();
vi.mock("./use-annotation-visualizers", () => ({
  useAnnotationVisualizers: (...args: unknown[]) =>
    useAnnotationVisualizersMock(...args),
}));

import { useAnnotationVisualSurfaces } from "./use-annotation-visual-surfaces";
import type { RuntimeVisualModels } from "./visual-models";

const EMPTY_MODELS: RuntimeVisualModels = {
  points: [],
  edges: [],
  polygonFills: [],
  pointLabels: [],
};

const noop = () => undefined;
const noopBool = () => false;

const renderSurfaces = (activeEditedNodeId: string | null) => {
  useAnnotationVisualizersMock.mockClear();
  renderHook(() =>
    useAnnotationVisualSurfaces(null, {
      baseVisualModels: EMPTY_MODELS,
      overlayVisualModels: EMPTY_MODELS,
      linkedNodeGroups: [],
      effectiveLinkedNodeGroups: [],
      selectedAnnotationIds: [],
      formatOptions: {} as never,
      lineLabelOptions: {},
      activeEditedNodeId,
      isMoveGizmoDragging: false,
      liveAnchors: {} as never,
      previewSnapTargetHoverEnabled: false,
      onPreviewSnapTargetNodeClick: noopBool,
      onAnnotationSelect: noop,
      onNodeAnnotationsSelect: noop,
      onNodeLongPress: noop,
      canStartNodeEditing: noopBool,
      onReferenceNodeClick: noopBool,
      onReferenceNodeHover: noop,
      onPreviewNodeHover: noop,
      onReferenceEdgeClick: noopBool,
      insertNodeTargetAnnotationIds: [],
      onInsertNodeTargetClick: noopBool,
      onDistanceTriangleCornerClick: noop,
    })
  );
  const previewArgs = useAnnotationVisualizersMock.mock.calls.find(
    ([, options]) => options?.surfaceKey === "preview"
  );
  return previewArgs?.[1] as Record<string, unknown> | undefined;
};

describe("useAnnotationVisualSurfaces overlay interactivity", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("makes the overlay surface interactive with reference handlers while editing", () => {
    const preview = renderSurfaces("node-a");
    expect(preview?.enableHostInteractionTargets).toBe(true);
    expect(typeof preview?.onReferenceNodeClick).toBe("function");
    expect(typeof preview?.onReferenceNodeHover).toBe("function");
  });

  it("keeps the overlay surface non-interactive when not editing", () => {
    const preview = renderSurfaces(null);
    expect(preview?.enableHostInteractionTargets).toBe(false);
    expect(preview?.onReferenceNodeClick).toBeUndefined();
    expect(preview?.onReferenceNodeHover).toBeUndefined();
  });
});
