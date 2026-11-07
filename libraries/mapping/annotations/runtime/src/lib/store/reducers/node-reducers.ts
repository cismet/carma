import type { PayloadAction } from "@reduxjs/toolkit";

import {
  buildNodeChainEdges,
  readMaxNumericSuffix,
} from "../annotation-entity-builder.helpers";
import { resolveNodeEditingDisabledNodeIds } from "../annotation-entry.helpers";
import type {
  InsertNodeIntoMeasurementEdgePayload,
  RemoveNodeFromAnnotationPayload,
  UpdateNodeCoordinateByIdPayload,
} from "../annotations-store-payloads";
import {
  reconcileNodeLinks,
  resolveNextNodeLinksForNodeMove,
} from "../node-links.helpers";
import { resolveAnnotationNodeMoveScope } from "../node-move-scope.helpers";
import type { AnnotationsStoreDraft } from "./reducer.types";

/** Drops the nodes no entry references and the links that lost their nodes. */
export const pruneUnusedNodes = (state: AnnotationsStoreDraft) => {
  const usedNodeIds = new Set(
    state.annotationEntries.flatMap(
      (annotationEntry) => annotationEntry.nodeIds
    )
  );
  state.nodes = state.nodes.filter((node) => usedNodeIds.has(node.id));
  state.linkedNodeGroups = reconcileNodeLinks({
    nodes: state.nodes,
    nodeLinks: state.linkedNodeGroups,
  });
};

export const nodeReducers = {
  updateNodeCoordinateById: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<UpdateNodeCoordinateByIdPayload>
  ) => {
    const {
      nodeId,
      coordinate,
      selectedAnnotationIds = [],
      movedNodeIds: preferredMovedNodeIds,
      linkToNodeId,
    } = action.payload;
    const { targetNode, movedNodeIds } = resolveAnnotationNodeMoveScope({
      nodeId,
      nodes: state.nodes,
      linkedNodeGroups: state.linkedNodeGroups,
      annotationEntries: state.annotationEntries,
      selectedAnnotationIds,
      preferredMovedNodeIds,
    });
    if (!targetNode || movedNodeIds.length === 0) {
      return;
    }

    const movedNodeIdSet = new Set(movedNodeIds);
    const nodeEditingDisabledNodeIds = resolveNodeEditingDisabledNodeIds(
      state.annotationEntries
    );
    const editableLinkToNodeId =
      linkToNodeId && !nodeEditingDisabledNodeIds.has(linkToNodeId)
        ? linkToNodeId
        : null;

    state.nodes.forEach((node) => {
      if (movedNodeIdSet.has(node.id)) {
        node.coordinate = coordinate;
      }
    });

    state.linkedNodeGroups = resolveNextNodeLinksForNodeMove({
      nodes: state.nodes,
      nodeLinks: state.linkedNodeGroups,
      nodeId: targetNode.id,
      movedNodeIds,
      linkToNodeId: editableLinkToNodeId,
    });
  },

  insertNodeIntoMeasurementEdge: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<InsertNodeIntoMeasurementEdgePayload>
  ) => {
    const { annotationId, startNodeId, endNodeId, coordinate } = action.payload;
    const measurement = state.annotationEntries.find(
      (entry) => entry.id === annotationId
    );
    if (!measurement) {
      return;
    }

    const targetNodePairIndex = measurement.nodeIds.findIndex(
      (nodeId, index) =>
        nodeId === startNodeId && measurement.nodeIds[index + 1] === endNodeId
    );
    const closingEdgeMatches =
      measurement.closed &&
      measurement.nodeIds.length >= 3 &&
      measurement.nodeIds[measurement.nodeIds.length - 1] === startNodeId &&
      measurement.nodeIds[0] === endNodeId;
    const insertNodeIndex =
      targetNodePairIndex >= 0
        ? targetNodePairIndex + 1
        : closingEdgeMatches
        ? measurement.nodeIds.length
        : -1;
    if (insertNodeIndex < 0) {
      return;
    }

    const edgeById = new Map(state.edges.map((edge) => [edge.id, edge]));
    const targetEdgeIdIndex = measurement.edgeIds.findIndex((edgeId) => {
      const edge = edgeById.get(edgeId);
      return edge?.startNodeId === startNodeId && edge.endNodeId === endNodeId;
    });
    const targetEdgeId =
      targetEdgeIdIndex >= 0 ? measurement.edgeIds[targetEdgeIdIndex] : null;
    const targetEdge = targetEdgeId ? edgeById.get(targetEdgeId) : undefined;
    if (!targetEdge || targetEdgeIdIndex < 0) {
      return;
    }

    const nextNodeId = `node-${
      readMaxNumericSuffix(state.nodes.map((node) => node.id)) + 1
    }`;
    const nextEdgeId = `edge-${
      readMaxNumericSuffix(state.edges.map((edge) => edge.id)) + 1
    }`;

    state.nodes.push({ id: nextNodeId, coordinate });
    state.linkedNodeGroups = reconcileNodeLinks({
      nodes: state.nodes,
      nodeLinks: [
        ...state.linkedNodeGroups,
        { id: nextNodeId, nodeIds: [nextNodeId] },
      ],
    });

    targetEdge.endNodeId = nextNodeId;
    const nextEdge = {
      id: nextEdgeId,
      startNodeId: nextNodeId,
      endNodeId,
    };
    const targetEdgeStateIndex = state.edges.findIndex(
      (edge) => edge.id === targetEdgeId
    );
    if (targetEdgeStateIndex >= 0) {
      state.edges.splice(targetEdgeStateIndex + 1, 0, nextEdge);
    } else {
      state.edges.push(nextEdge);
    }

    measurement.nodeIds = [
      ...measurement.nodeIds.slice(0, insertNodeIndex),
      nextNodeId,
      ...measurement.nodeIds.slice(insertNodeIndex),
    ];
    measurement.edgeIds = [
      ...measurement.edgeIds.slice(0, targetEdgeIdIndex + 1),
      nextEdgeId,
      ...measurement.edgeIds.slice(targetEdgeIdIndex + 1),
    ];
  },

  removeNodeFromAnnotation: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<RemoveNodeFromAnnotationPayload>
  ) => {
    const { annotationId, nodeId } = action.payload;
    const measurement = state.annotationEntries.find(
      (entry) => entry.id === annotationId
    );
    if (!measurement?.nodeIds.includes(nodeId)) {
      return;
    }

    const nextNodeIds = measurement.nodeIds.filter(
      (measurementNodeId) => measurementNodeId !== nodeId
    );
    const previousEdgeIdSet = new Set(measurement.edgeIds);
    const nextEdges = buildNodeChainEdges({
      nodeIds: nextNodeIds,
      closed: Boolean(measurement.closed),
      previousEdgeNumericSuffix: readMaxNumericSuffix(
        state.edges.map((edge) => edge.id)
      ),
    });

    measurement.nodeIds = nextNodeIds;
    measurement.edgeIds = nextEdges.map((edge) => edge.id);
    state.edges = [
      ...state.edges.filter((edge) => !previousEdgeIdSet.has(edge.id)),
      ...nextEdges,
    ];
    pruneUnusedNodes(state);
  },
};
