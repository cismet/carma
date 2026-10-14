import { act, renderHook } from "@testing-library/react";
import type { Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import {
  ANNOTATION_TYPES,
  type AnnotationEngine,
  type AnnotationPointMoveGizmoOptions,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationsStore,
  AnnotationNode,
  StoredAnnotation,
} from "../store";
import {
  ANNOTATION_NODE_EDIT_RULES,
  BASIC_ANNOTATION_NODE_EDIT_RULES,
} from "./annotation-node-edit-rules";
import { usePointEditingGizmo } from "./use-point-editing-gizmo";

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

describe("usePointEditingGizmo node edit rules", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const createCornerNode = (
    id: string,
    longitude: number,
    latitude: number,
    altitude: number
  ): AnnotationNode => ({
    id,
    coordinate: { longitude, latitude, altitude },
  });
  // a, b, c span the roof; t floats 10 m above its plane.
  const nodes = [
    createCornerNode("a", 7, 51, 100),
    createCornerNode("b", 7.0001, 51, 100),
    createCornerNode("c", 7, 51.0001, 100),
    createCornerNode("t", 7.0002, 51.0002, 110),
  ];
  const SNAP_SCREEN_POSITION = { x: 100, y: 100 };
  const createArea = (toolType: string) =>
    ({
      id: "area",
      toolType,
      nodeIds: ["a", "b", "c"],
      closed: true,
    } as StoredAnnotation);

  // Only t is on screen at the snap position; every other node is far away.
  const createGizmoEngine = () => {
    const usePointMoveGizmo = vi.fn();
    const tPosition = ecefFromGeographicCoordinate(nodes[3]!.coordinate);
    const engine = {
      capabilities: {},
      isDestroyed: () => false,
      requestRender: vi.fn(),
      worldToScreen: (position: Vector3) =>
        position.distanceTo(tPosition) < 1e-6
          ? SNAP_SCREEN_POSITION
          : { x: 5000, y: 5000 },
      hooks: { usePointMoveGizmo, usePointQuery: vi.fn() },
    } as unknown as AnnotationEngine;
    return {
      engine,
      gizmoOptions: () =>
        usePointMoveGizmo.mock.calls.at(
          -1
        )?.[0] as AnnotationPointMoveGizmoOptions,
    };
  };

  const editNodeA = (
    toolType: string,
    resolveNodeEditRule?: Parameters<
      typeof usePointEditingGizmo
    >[3]["resolveNodeEditRule"]
  ) => {
    const { engine, gizmoOptions } = createGizmoEngine();
    const annotationEntries = [createArea(toolType)];
    const annotationsStore = {
      getState: () => ({
        annotationEntries,
        selectionState: { selectedAnnotationIds: ["area"] },
      }),
      dispatch: vi.fn(),
    } as unknown as AnnotationsStore;
    const { result } = renderHook(() =>
      usePointEditingGizmo(engine, nodes, [], {
        annotationsStore,
        annotationEntries,
        selectedAnnotationIds: ["area"],
        resolveNodeEditRule,
      })
    );
    act(() => {
      result.current.handleNodeLongPress("a");
    });
    return { result, gizmoOptions };
  };

  const clickEdgeAB = (
    result: ReturnType<typeof editNodeA>["result"]
  ): boolean => {
    let handled = false;
    act(() => {
      handled = result.current.handleReferenceEdgeClick("a", "b");
    });
    return handled;
  };

  const basicRules = (toolType: string) =>
    BASIC_ANNOTATION_NODE_EDIT_RULES[
      toolType as keyof typeof BASIC_ANNOTATION_NODE_EDIT_RULES
    ];
  const perTypeRules = (toolType: string) =>
    ANNOTATION_NODE_EDIT_RULES[
      toolType as keyof typeof ANNOTATION_NODE_EDIT_RULES
    ];

  it("offers the arrows and the surface drag on a footprint corner without rules", () => {
    const { result, gizmoOptions } = editNodeA(ANNOTATION_TYPES.AREA_GROUND);

    expect(gizmoOptions()).toMatchObject({
      movePointId: "a",
      showAxes: true,
      snapPlaneDragToGround: true,
      discPlaneNormal: null,
    });
    expect(clickEdgeAB(result)).toBe(true);
  });

  it("holds a roof corner to its plane and keeps its arrows with the basic rules", () => {
    const { result, gizmoOptions } = editNodeA(
      ANNOTATION_TYPES.AREA_PLANAR,
      basicRules
    );

    expect(gizmoOptions()).toMatchObject({
      showAxes: true,
      snapPlaneDragToGround: false,
    });
    expect(gizmoOptions().discPlaneNormal).not.toBeNull();
    expect(clickEdgeAB(result)).toBe(true);
  });

  it("edits a footprint corner without the arrows and the edge axes with the per-type rules", () => {
    const { result, gizmoOptions } = editNodeA(
      ANNOTATION_TYPES.AREA_GROUND,
      perTypeRules
    );

    expect(gizmoOptions()).toMatchObject({
      showAxes: false,
      snapPlaneDragToGround: true,
      discPlaneNormal: null,
    });
    expect(clickEdgeAB(result)).toBe(false);
  });

  it("edits a roof corner in its plane without the arrows and the surface drag with the per-type rules", () => {
    const { gizmoOptions } = editNodeA(
      ANNOTATION_TYPES.AREA_PLANAR,
      perTypeRules
    );

    expect(gizmoOptions()).toMatchObject({
      showAxes: false,
      snapPlaneDragToGround: false,
    });
    expect(gizmoOptions().discPlaneNormal).not.toBeNull();
  });

  it("only lets the measurements of tools with a rule govern the node", () => {
    // a roof and a selected footprint hold the node; without a rule for the
    // footprint the roof governs it, as before the per-type rules
    const { engine, gizmoOptions } = createGizmoEngine();
    const annotationEntries = [
      createArea(ANNOTATION_TYPES.AREA_PLANAR),
      {
        ...createArea(ANNOTATION_TYPES.AREA_GROUND),
        id: "footprint",
      } as StoredAnnotation,
    ];
    const selectedAnnotationIds = ["area", "footprint"];
    const annotationsStore = {
      getState: () => ({
        annotationEntries,
        selectionState: { selectedAnnotationIds },
      }),
      dispatch: vi.fn(),
    } as unknown as AnnotationsStore;
    const { result } = renderHook(() =>
      usePointEditingGizmo(engine, nodes, [], {
        annotationsStore,
        annotationEntries,
        selectedAnnotationIds,
        resolveNodeEditRule: basicRules,
      })
    );
    act(() => {
      result.current.handleNodeLongPress("a");
    });

    expect(gizmoOptions().discPlaneNormal).not.toBeNull();
    expect(gizmoOptions().snapPlaneDragToGround).toBe(false);
  });

  describe("snapping a roof corner to a node off the roof plane", () => {
    const dragNodeAOntoT = (
      resolveNodeEditRule: Parameters<
        typeof usePointEditingGizmo
      >[3]["resolveNodeEditRule"]
    ) => {
      vi.useFakeTimers();
      const { result, gizmoOptions } = editNodeA(
        ANNOTATION_TYPES.AREA_PLANAR,
        resolveNodeEditRule
      );
      act(() => {
        gizmoOptions().onPointPositionChange?.(
          "a",
          ecefFromGeographicCoordinate({
            longitude: 7,
            latitude: 51,
            altitude: 150,
          }),
          SNAP_SCREEN_POSITION
        );
      });
      act(() => {
        vi.runAllTimers();
      });
      return result.current.draftNodeCoordinateOverrides["a"];
    };

    it("joins it with the basic rules", () => {
      expect(dragNodeAOntoT(basicRules)?.altitude).toBe(110);
    });

    it("refuses it and stays in the plane with the per-type rules", () => {
      const altitude = dragNodeAOntoT(perTypeRules)?.altitude ?? NaN;

      expect(Math.abs(altitude - 100)).toBeLessThan(0.5);
    });
  });
});
