import { describe, expect, it } from "vitest";

import type {
  RuntimeAnnotationEntry,
  RuntimeCoordinate,
} from "./annotations-store.types";
import {
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  updateNodeCoordinateById,
} from "./create-annotations-store";
import { buildNodeLinkIdByNodeId } from "./node-links.helpers";

const createCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 0
): RuntimeCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const createAnnotationEntry = (
  annotationId: string,
  nodeId: string
): RuntimeAnnotationEntry => ({
  id: annotationId,
  toolType: "distance",
  nodeIds: [nodeId],
  edgeIds: [],
});

describe("createAnnotationsStore", () => {
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
});
