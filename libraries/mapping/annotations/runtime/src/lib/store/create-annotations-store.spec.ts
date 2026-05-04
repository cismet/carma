import { describe, expect, it } from "vitest";

import type {
  StoredAnnotation,
  CesiumGeographicCoordinate,
} from "./annotations-store.types";
import {
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  insertNodeIntoMeasurementEdge,
  updateAnnotationEntryById,
  updateNodeCoordinateById,
} from "./create-annotations-store";
import { buildNodeLinkIdByNodeId } from "./node-links.helpers";

const createCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 0
): CesiumGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const createAnnotationEntry = (
  annotationId: string,
  nodeId: string
): StoredAnnotation => ({
  id: annotationId,
  toolType: "distance",
  nodeIds: [nodeId],
  edgeIds: [],
});

const createNodeChainAnnotationEntry = ({
  annotationId,
  toolType,
  nodeIds,
  edgeIds,
  closed = false,
}: {
  annotationId: string;
  toolType: StoredAnnotation["toolType"];
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  closed?: boolean;
}): StoredAnnotation => ({
  id: annotationId,
  toolType,
  nodeIds,
  edgeIds,
  closed,
});

describe("createAnnotationsStore", () => {
  it("scopes label appearance patches to one annotation and merges existing fields", () => {
    const store = createAnnotationsStore({
      ...createInitialAnnotationsStoreState(),
      annotationEntries: [
        {
          id: "label-a",
          toolType: "label",
          nodeIds: ["node-a"],
          edgeIds: [],
          labelAppearance: {
            backgroundColor: "#123456",
          },
        },
        {
          id: "label-b",
          toolType: "label",
          nodeIds: ["node-b"],
          edgeIds: [],
          labelAppearance: {
            backgroundColor: "#654321",
            textColor: "#fedcba",
          },
        },
      ],
      nodes: [
        { id: "node-a", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-b", coordinate: createCoordinate(7.1, 51.1) },
      ],
    });

    store.dispatch(
      updateAnnotationEntryById({
        annotationId: "label-a",
        labelAppearance: {
          textColor: "#abcdef",
        },
      })
    );

    expect(store.getState().annotationEntries).toEqual([
      {
        id: "label-a",
        toolType: "label",
        nodeIds: ["node-a"],
        edgeIds: [],
        labelAppearance: {
          backgroundColor: "#123456",
          textColor: "#abcdef",
        },
      },
      {
        id: "label-b",
        toolType: "label",
        nodeIds: ["node-b"],
        edgeIds: [],
        labelAppearance: {
          backgroundColor: "#654321",
          textColor: "#fedcba",
        },
      },
    ]);
  });

  it("voids linked-node relationships when a selected subset is moved away", () => {
    const store = createAnnotationsStore({
      ...createInitialAnnotationsStoreState(),
      annotationEntries: [
        createAnnotationEntry("annotation-a", "node-a"),
        createAnnotationEntry("annotation-b", "node-b"),
        createAnnotationEntry("annotation-c", "node-c"),
      ],
      nodes: [
        { id: "node-a", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-b", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-c", coordinate: createCoordinate(7.0, 51.0) },
      ],
      linkedNodeGroups: [
        {
          id: "shared-group",
          nodeIds: ["node-a", "node-b", "node-c"],
        },
      ],
    });
    const movedCoordinate = createCoordinate(7.001, 51.001, 5);

    store.dispatch(
      updateNodeCoordinateById({
        nodeId: "node-a",
        coordinate: movedCoordinate,
        selectedMeasurementIds: ["annotation-a", "annotation-b"],
      })
    );

    const state = store.getState();
    const nodeLinkIdByNodeId = buildNodeLinkIdByNodeId(state.linkedNodeGroups);

    expect(state.nodes).toEqual([
      { id: "node-a", coordinate: movedCoordinate },
      { id: "node-b", coordinate: movedCoordinate },
      { id: "node-c", coordinate: createCoordinate(7.0, 51.0) },
    ]);
    expect(state.linkedNodeGroups).toEqual([
      { id: "shared-group", nodeIds: ["node-c"] },
      { id: "node-a", nodeIds: ["node-a"] },
      { id: "node-b", nodeIds: ["node-b"] },
    ]);
    expect(nodeLinkIdByNodeId.get("node-a")).toBe("node-a");
    expect(nodeLinkIdByNodeId.get("node-b")).toBe("node-b");
    expect(nodeLinkIdByNodeId.get("node-c")).toBe("shared-group");
  });

  it("uses the finalized live-edit move scope even if selection is no longer present on commit", () => {
    const store = createAnnotationsStore({
      ...createInitialAnnotationsStoreState(),
      annotationEntries: [
        createAnnotationEntry("annotation-a", "node-a"),
        createAnnotationEntry("annotation-b", "node-b"),
        createAnnotationEntry("annotation-c", "node-c"),
      ],
      nodes: [
        { id: "node-a", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-b", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-c", coordinate: createCoordinate(7.0, 51.0) },
      ],
      linkedNodeGroups: [
        {
          id: "shared-group",
          nodeIds: ["node-a", "node-b", "node-c"],
        },
      ],
    });
    const movedCoordinate = createCoordinate(7.001, 51.001, 5);

    store.dispatch(
      updateNodeCoordinateById({
        nodeId: "node-a",
        coordinate: movedCoordinate,
        movedNodeIds: ["node-a", "node-b"],
        selectedMeasurementIds: [],
      })
    );

    const state = store.getState();
    const nodeLinkIdByNodeId = buildNodeLinkIdByNodeId(state.linkedNodeGroups);

    expect(state.nodes).toEqual([
      { id: "node-a", coordinate: movedCoordinate },
      { id: "node-b", coordinate: movedCoordinate },
      { id: "node-c", coordinate: createCoordinate(7.0, 51.0) },
    ]);
    expect(state.linkedNodeGroups).toEqual([
      { id: "shared-group", nodeIds: ["node-c"] },
      { id: "node-a", nodeIds: ["node-a"] },
      { id: "node-b", nodeIds: ["node-b"] },
    ]);
    expect(nodeLinkIdByNodeId.get("node-a")).toBe("node-a");
    expect(nodeLinkIdByNodeId.get("node-b")).toBe("node-b");
    expect(nodeLinkIdByNodeId.get("node-c")).toBe("shared-group");
  });

  it("keeps the link when the whole linked group moves together", () => {
    const store = createAnnotationsStore({
      ...createInitialAnnotationsStoreState(),
      annotationEntries: [
        createAnnotationEntry("annotation-a", "node-a"),
        createAnnotationEntry("annotation-b", "node-b"),
      ],
      nodes: [
        { id: "node-a", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-b", coordinate: createCoordinate(7.0, 51.0) },
      ],
      linkedNodeGroups: [
        {
          id: "shared-group",
          nodeIds: ["node-a", "node-b"],
        },
      ],
    });
    const movedCoordinate = createCoordinate(7.001, 51.001, 5);

    store.dispatch(
      updateNodeCoordinateById({
        nodeId: "node-a",
        coordinate: movedCoordinate,
      })
    );

    const state = store.getState();
    const nodeLinkIdByNodeId = buildNodeLinkIdByNodeId(state.linkedNodeGroups);

    expect(state.nodes).toEqual([
      { id: "node-a", coordinate: movedCoordinate },
      { id: "node-b", coordinate: movedCoordinate },
    ]);
    expect(state.linkedNodeGroups).toEqual([
      {
        id: "shared-group",
        nodeIds: ["node-a", "node-b"],
      },
    ]);
    expect(nodeLinkIdByNodeId.get("node-a")).toBe("shared-group");
    expect(nodeLinkIdByNodeId.get("node-b")).toBe("shared-group");
  });

  it("merges the moved live-edit scope into the snapped target group on commit", () => {
    const snappedCoordinate = createCoordinate(7.002, 51.002, 8);
    const store = createAnnotationsStore({
      ...createInitialAnnotationsStoreState(),
      annotationEntries: [
        createAnnotationEntry("annotation-a", "node-a"),
        createAnnotationEntry("annotation-b", "node-b"),
        createAnnotationEntry("annotation-c", "node-c"),
      ],
      nodes: [
        { id: "node-a", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-b", coordinate: createCoordinate(7.0, 51.0) },
        { id: "node-c", coordinate: snappedCoordinate },
      ],
      linkedNodeGroups: [
        {
          id: "source-group",
          nodeIds: ["node-a", "node-b"],
        },
        {
          id: "target-group",
          nodeIds: ["node-c"],
        },
      ],
    });

    store.dispatch(
      updateNodeCoordinateById({
        nodeId: "node-a",
        coordinate: snappedCoordinate,
        movedNodeIds: ["node-a"],
        linkToNodeId: "node-c",
      })
    );

    const state = store.getState();
    const nodeLinkIdByNodeId = buildNodeLinkIdByNodeId(state.linkedNodeGroups);

    expect(state.nodes).toEqual([
      { id: "node-a", coordinate: snappedCoordinate },
      { id: "node-b", coordinate: createCoordinate(7.0, 51.0) },
      { id: "node-c", coordinate: snappedCoordinate },
    ]);
    expect(state.linkedNodeGroups).toEqual([
      { id: "source-group", nodeIds: ["node-b"] },
      { id: "target-group", nodeIds: ["node-c", "node-a"] },
    ]);
    expect(nodeLinkIdByNodeId.get("node-a")).toBe("target-group");
    expect(nodeLinkIdByNodeId.get("node-b")).toBe("source-group");
    expect(nodeLinkIdByNodeId.get("node-c")).toBe("target-group");
  });

  it("inserts a node into an open node chain edge", () => {
    const store = createAnnotationsStore({
      ...createInitialAnnotationsStoreState(),
      annotationEntries: [
        createNodeChainAnnotationEntry({
          annotationId: "polyline-1",
          toolType: "polyline",
          nodeIds: ["node-1", "node-2", "node-3"],
          edgeIds: ["edge-1", "edge-2"],
        }),
      ],
      nodes: [
        { id: "node-1", coordinate: createCoordinate(7.0, 51.0, 1) },
        { id: "node-2", coordinate: createCoordinate(7.1, 51.1, 2) },
        { id: "node-3", coordinate: createCoordinate(7.2, 51.2, 3) },
      ],
      linkedNodeGroups: [
        { id: "node-1", nodeIds: ["node-1"] },
        { id: "node-2", nodeIds: ["node-2"] },
        { id: "node-3", nodeIds: ["node-3"] },
      ],
      edges: [
        { id: "edge-1", startNodeId: "node-1", endNodeId: "node-2" },
        { id: "edge-2", startNodeId: "node-2", endNodeId: "node-3" },
      ],
    });

    store.dispatch(
      insertNodeIntoMeasurementEdge({
        measurementId: "polyline-1",
        startNodeId: "node-1",
        endNodeId: "node-2",
        coordinate: createCoordinate(7.05, 51.05, 1.5),
      })
    );

    expect(store.getState().annotationEntries[0]).toMatchObject({
      id: "polyline-1",
      nodeIds: ["node-1", "node-4", "node-2", "node-3"],
      edgeIds: ["edge-1", "edge-3", "edge-2"],
    });
    expect(store.getState().edges).toEqual([
      { id: "edge-1", startNodeId: "node-1", endNodeId: "node-4" },
      { id: "edge-3", startNodeId: "node-4", endNodeId: "node-2" },
      { id: "edge-2", startNodeId: "node-2", endNodeId: "node-3" },
    ]);
    expect(store.getState().nodes[3]).toEqual({
      id: "node-4",
      coordinate: createCoordinate(7.05, 51.05, 1.5),
    });
    expect(
      buildNodeLinkIdByNodeId(store.getState().linkedNodeGroups).get("node-4")
    ).toBe("node-4");
  });

  it("inserts a node into a closing polygon edge", () => {
    const store = createAnnotationsStore({
      ...createInitialAnnotationsStoreState(),
      annotationEntries: [
        createNodeChainAnnotationEntry({
          annotationId: "area-1",
          toolType: "area-ground",
          nodeIds: ["node-1", "node-2", "node-3"],
          edgeIds: ["edge-1", "edge-2", "edge-3"],
          closed: true,
        }),
      ],
      nodes: [
        { id: "node-1", coordinate: createCoordinate(7.0, 51.0, 0) },
        { id: "node-2", coordinate: createCoordinate(7.1, 51.0, 0) },
        { id: "node-3", coordinate: createCoordinate(7.05, 51.1, 0) },
      ],
      linkedNodeGroups: [
        { id: "node-1", nodeIds: ["node-1"] },
        { id: "node-2", nodeIds: ["node-2"] },
        { id: "node-3", nodeIds: ["node-3"] },
      ],
      edges: [
        { id: "edge-1", startNodeId: "node-1", endNodeId: "node-2" },
        { id: "edge-2", startNodeId: "node-2", endNodeId: "node-3" },
        { id: "edge-3", startNodeId: "node-3", endNodeId: "node-1" },
      ],
    });

    store.dispatch(
      insertNodeIntoMeasurementEdge({
        measurementId: "area-1",
        startNodeId: "node-3",
        endNodeId: "node-1",
        coordinate: createCoordinate(7.025, 51.05, 0),
      })
    );

    expect(store.getState().annotationEntries[0]).toMatchObject({
      id: "area-1",
      nodeIds: ["node-1", "node-2", "node-3", "node-4"],
      edgeIds: ["edge-1", "edge-2", "edge-3", "edge-4"],
    });
    expect(store.getState().edges).toEqual([
      { id: "edge-1", startNodeId: "node-1", endNodeId: "node-2" },
      { id: "edge-2", startNodeId: "node-2", endNodeId: "node-3" },
      { id: "edge-3", startNodeId: "node-3", endNodeId: "node-4" },
      { id: "edge-4", startNodeId: "node-4", endNodeId: "node-1" },
    ]);
  });
});
