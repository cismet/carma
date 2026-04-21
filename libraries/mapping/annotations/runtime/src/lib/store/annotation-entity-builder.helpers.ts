import type { MutableRefObject } from "react";

import type {
  AddAnnotationOptions,
  StoredAnnotation,
  CesiumGeographicCoordinate,
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
  coordinates: readonly CesiumGeographicCoordinate[];
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
  const nodeLinks = nodes.map((node, index) => {
    const nodeLinkId = linkedNodeGroupIds?.[index];
    const normalizedNodeLinkId =
      typeof nodeLinkId === "string" && nodeLinkId.trim().length > 0
        ? nodeLinkId.trim()
        : node.id;

    return {
      id: normalizedNodeLinkId,
      nodeIds: [node.id],
    };
  });
  const edges = nodes.slice(0, -1).map((node, index) => {
    const endNode = nodes[index + 1];

    edgeSequenceRef.current += 1;

    return {
      id: `edge-${edgeSequenceRef.current}`,
      startNodeId: node.id,
      endNodeId: endNode.id,
    };
  });
  if (options?.closed && nodes.length >= 3) {
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];

    if (firstNode && lastNode) {
      edgeSequenceRef.current += 1;
      edges.push({
        id: `edge-${edgeSequenceRef.current}`,
        startNodeId: lastNode.id,
        endNodeId: firstNode.id,
      });
    }
  }
  const annotationEntry: StoredAnnotation = {
    id: annotationEntryId,
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
