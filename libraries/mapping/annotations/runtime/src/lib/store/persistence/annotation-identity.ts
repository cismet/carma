import { createAnnotationUuid } from "../../utils/annotation-uuid";
import type { StoredAnnotation } from "../annotations-store.types";
import type { AnnotationsRuntimePersistenceEnvelope } from "./persistence-format";

/**
 * What makes a measurement the same measurement: its entry without its
 * identity, its node coordinates and its edges in order.
 */
export const buildAnnotationContentSignature = (
  state: AnnotationsRuntimePersistenceEnvelope,
  annotationEntry: StoredAnnotation
): string => {
  const nodesById = new Map(state.tables.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(state.tables.edges.map((edge) => [edge.id, edge]));
  const { uuid: _uuid, id: _id, nodeIds, edgeIds, ...rest } = annotationEntry;
  return JSON.stringify({
    entry: rest,
    nodes: nodeIds.map((nodeId) => {
      const node = nodesById.get(nodeId);
      return node
        ? [
            node.coordinate.longitude,
            node.coordinate.latitude,
            node.coordinate.altitude,
          ]
        : null;
    }),
    edges: edgeIds.map((edgeId) => {
      const edge = edgesById.get(edgeId);
      return edge
        ? [nodeIds.indexOf(edge.startNodeId), nodeIds.indexOf(edge.endNodeId)]
        : null;
    }),
  });
};

/**
 * The entry with a uuid: its own, or a new one for sets saved before entries
 * carried one. The new uuid is written with the next save.
 */
export const withAnnotationUuid = (
  annotationEntry: StoredAnnotation
): StoredAnnotation =>
  annotationEntry.uuid
    ? annotationEntry
    : { ...annotationEntry, uuid: createAnnotationUuid() };
