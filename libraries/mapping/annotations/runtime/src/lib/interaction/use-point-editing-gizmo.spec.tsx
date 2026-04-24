import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

const measurement = {
  id: "measurement-a",
  toolType: "distance",
  nodeIds: ["node-a"],
} as StoredAnnotation;

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
  it("starts node editing without changing measurement selection", () => {
    const annotationsStore = createAnnotationsStore();
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

    expect(result.current.activeMoveGizmoNodeId).toBe("node-a");
    expect(annotationsStore.dispatch).not.toHaveBeenCalled();
  });
});
