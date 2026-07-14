import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AnnotationsStore,
  AnnotationNode,
  StoredAnnotation,
} from "../store";
import { usePointEditingGizmo } from "./use-point-editing-gizmo";

vi.mock("@carma-mapping/gizmo/cesium", () => ({
  useCesiumPointMoveGizmo: vi.fn(),
}));

const node = {
  id: "node-a",
  coordinate: {
    longitude: 7,
    latitude: 51,
    altitude: 100,
  },
} satisfies AnnotationNode;

const createNode = (id: string, altitude: number = 100): AnnotationNode => ({
  id,
  coordinate: {
    longitude: 7,
    latitude: 51,
    altitude,
  },
});

const measurement = {
  id: "measurement-a",
  toolType: "distance",
  nodeIds: ["node-a"],
} as StoredAnnotation;

const createAnnotationEntry = (id: string, nodeId: string): StoredAnnotation =>
  ({
    id,
    toolType: "distance",
    nodeIds: [nodeId],
  } as StoredAnnotation);

const createAnnotationsStore = ({
  annotationEntries = [measurement],
  selectedAnnotationIds = ["measurement-b"],
}: {
  annotationEntries?: readonly StoredAnnotation[];
  selectedAnnotationIds?: readonly string[];
} = {}) =>
  ({
    getState: () => ({
      annotationEntries,
      selectionState: {
        selectedAnnotationIds,
      },
    }),
    dispatch: vi.fn(),
  } as unknown as AnnotationsStore & { dispatch: ReturnType<typeof vi.fn> });

describe("usePointEditingGizmo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The draft preview flush is a trailing throttle (setTimeout); run it so the
  // React draft state reflects the latest pointer input.
  const flushDraftPreview = () => {
    act(() => {
      vi.runAllTimers();
    });
  };

  it("starts node editing on the selected measurement without changing selection", () => {
    const annotationsStore = createAnnotationsStore({
      selectedAnnotationIds: ["measurement-a"],
    });
    const { result } = renderHook(() =>
      usePointEditingGizmo(null, [node], [], {
        annotationsStore,
        annotationEntries: [measurement],
        selectedAnnotationIds: ["measurement-a"],
      })
    );

    act(() => {
      result.current.handleNodeLongPress("node-a");
    });

    expect(result.current.activeEditedNodeId).toBe("node-a");
    expect(annotationsStore.dispatch).not.toHaveBeenCalled();
  });

  it("leaves edit mode when the edited measurement is deselected (e.g. mode change)", () => {
    const annotationsStore = createAnnotationsStore({
      selectedAnnotationIds: ["measurement-a"],
    });
    const { result, rerender } = renderHook(
      ({ selectedAnnotationIds }: { selectedAnnotationIds: string[] }) =>
        usePointEditingGizmo(null, [node], [], {
          annotationsStore,
          annotationEntries: [measurement],
          selectedAnnotationIds,
        }),
      { initialProps: { selectedAnnotationIds: ["measurement-a"] } }
    );

    act(() => {
      result.current.handleNodeLongPress("node-a");
    });
    expect(result.current.activeEditedNodeId).toBe("node-a");

    // A mode change clears the selection; the gizmo must not linger.
    rerender({ selectedAnnotationIds: [] });

    expect(result.current.activeEditedNodeId).toBeNull();
  });

  it("does not start node editing when the node's measurement is not selected", () => {
    const annotationsStore = createAnnotationsStore({
      selectedAnnotationIds: ["measurement-b"],
    });
    const { result } = renderHook(() =>
      usePointEditingGizmo(null, [node], [], {
        annotationsStore,
        annotationEntries: [measurement],
        selectedAnnotationIds: ["measurement-b"],
      })
    );

    act(() => {
      result.current.handleNodeLongPress("node-a");
    });

    expect(result.current.activeEditedNodeId).toBeNull();
    expect(annotationsStore.dispatch).not.toHaveBeenCalled();
  });

  it("limits live linked-node preview moves to selected measurements", () => {
    vi.useFakeTimers();
    const nodes = [
      createNode("node-a"),
      createNode("node-b"),
      createNode("ref", 180),
    ];
    const annotationEntries = [
      createAnnotationEntry("measurement-a", "node-a"),
      createAnnotationEntry("measurement-b", "node-b"),
    ];
    const annotationsStore = createAnnotationsStore({
      annotationEntries,
      selectedAnnotationIds: ["measurement-a"],
    });
    const { result } = renderHook(() =>
      usePointEditingGizmo(
        null,
        nodes,
        [
          { id: "shared-group", nodeIds: ["node-a", "node-b"] },
          { id: "ref", nodeIds: ["ref"] },
        ],
        {
          annotationsStore,
          annotationEntries,
          selectedAnnotationIds: ["measurement-a"],
        }
      )
    );

    act(() => {
      result.current.handleNodeLongPress("node-a");
    });
    act(() => {
      result.current.handleReferenceNodeHover("ref", true);
    });
    flushDraftPreview();

    expect(Object.keys(result.current.draftNodeCoordinateOverrides)).toEqual([
      "node-a",
    ]);
    expect(
      result.current.draftNodeCoordinateOverrides["node-a"]?.altitude
    ).toBe(180);
    expect(
      result.current.draftNodeCoordinateOverrides["node-b"]
    ).toBeUndefined();
    expect(result.current.effectiveLinkedNodeGroups).toContainEqual({
      id: "shared-group",
      nodeIds: ["node-b"],
    });
    expect(result.current.effectiveLinkedNodeGroups).toContainEqual({
      id: "node-a",
      nodeIds: ["node-a"],
    });
  });

  it("keeps linked nodes together during live preview when their measurements are selected", () => {
    vi.useFakeTimers();
    const nodes = [
      createNode("node-a"),
      createNode("node-b"),
      createNode("ref", 180),
    ];
    const annotationEntries = [
      createAnnotationEntry("measurement-a", "node-a"),
      createAnnotationEntry("measurement-b", "node-b"),
    ];
    const annotationsStore = createAnnotationsStore({
      annotationEntries,
      selectedAnnotationIds: ["measurement-a", "measurement-b"],
    });
    const { result } = renderHook(() =>
      usePointEditingGizmo(
        null,
        nodes,
        [
          { id: "shared-group", nodeIds: ["node-a", "node-b"] },
          { id: "ref", nodeIds: ["ref"] },
        ],
        {
          annotationsStore,
          annotationEntries,
          selectedAnnotationIds: ["measurement-a", "measurement-b"],
        }
      )
    );

    act(() => {
      result.current.handleNodeLongPress("node-a");
    });
    act(() => {
      result.current.handleReferenceNodeHover("ref", true);
    });
    flushDraftPreview();

    expect(Object.keys(result.current.draftNodeCoordinateOverrides)).toEqual([
      "node-a",
      "node-b",
    ]);
    expect(result.current.effectiveLinkedNodeGroups).toContainEqual({
      id: "shared-group",
      nodeIds: ["node-a", "node-b"],
    });
  });
});
