import type { MutableRefObject } from "react";
import { createAnnotationUuid } from "../utils/annotation-uuid";
import { normalizeEntityId } from "./node-links.helpers";
import type {
  AddAnnotationOptions,
  StoredAnnotation,
  AnnotationGeographicCoordinate,
  AnnotationEdge,
  AnnotationNodeLink,
  AnnotationNodeLinkId,
  AnnotationNode,
} from "./annotations-store.types";

export const readMaxNumericSuffix = (ids: readonly string[]): number =>
  ids.reduce((maxValue, id) => {
    const match = id.match(/(\d+)$/);
    const numericSuffix = match ? Number(match[1]) : Number.NaN;

    return Number.isFinite(numericSuffix)
      ? Math.max(maxValue, numericSuffix)
      : maxValue;
  }, 0);

/** Consecutive edges over the node ids, closed by a last-to-first edge from three nodes on. */
export const buildNodeChainEdges = ({
  nodeIds,
  closed,
  previousEdgeNumericSuffix,
}: {
  nodeIds: readonly string[];
  closed: boolean;
  previousEdgeNumericSuffix: number;
}): AnnotationEdge[] => {
  const edgeNodePairs = nodeIds.slice(0, -1).map((startNodeId, index) => ({
    startNodeId,
    endNodeId: nodeIds[index + 1],
  }));
  if (closed && nodeIds.length >= 3) {
    edgeNodePairs.push({
      startNodeId: nodeIds[nodeIds.length - 1],
      endNodeId: nodeIds[0],
    });
  }
  return edgeNodePairs.map((edgeNodePair, index) => ({
    id: `edge-${previousEdgeNumericSuffix + index + 1}`,
    ...edgeNodePair,
  }));
};

export const buildMeasurementEntities = ({
  toolType,
  coordinates,
  options,
  linkedNodeGroupIds,
  measurementSequenceRef,
  nodeSequenceRef,
  edgeSequenceRef,
}: {
  toolType: StoredAnnotation["toolType"];
  coordinates: readonly AnnotationGeographicCoordinate[];
  options?: AddAnnotationOptions;
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[];
  measurementSequenceRef: MutableRefObject<number>;
  nodeSequenceRef: MutableRefObject<number>;
  edgeSequenceRef: MutableRefObject<number>;
}): {
  annotationEntry: StoredAnnotation;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  edges: readonly AnnotationEdge[];
} => {
  measurementSequenceRef.current += 1;
  const annotationEntryId = `${toolType}-${measurementSequenceRef.current}`;
  const nodes = coordinates.map((coordinate) => {
    nodeSequenceRef.current += 1;
    const nodeId = `node-${nodeSequenceRef.current}`;

    return {
      id: nodeId,
      coordinate,
    };
  });
  const nodeLinks = nodes.map((node, index) => ({
    id: normalizeEntityId(linkedNodeGroupIds?.[index]) ?? node.id,
    nodeIds: [node.id],
  }));
  const edges = buildNodeChainEdges({
    nodeIds: nodes.map((node) => node.id),
    closed: Boolean(options?.closed),
    previousEdgeNumericSuffix: edgeSequenceRef.current,
  });
  edgeSequenceRef.current += edges.length;
  const annotationEntry: StoredAnnotation = {
    id: annotationEntryId,
    uuid: createAnnotationUuid(),
    toolType,
    ...options,
    nodeIds: nodes.map((node) => node.id),
    edgeIds: edges.map((edge) => edge.id),
  };

  return {
    annotationEntry,
    nodes,
    linkedNodeGroups: nodeLinks,
    edges,
  };
};
