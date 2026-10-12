import { createAnnotationUuid } from "../../utils/annotation-uuid";
import type { StoredAnnotation } from "../annotations-store.types";
import {
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./persistence-format";

/**
 * What makes a measurement the same measurement: its entry without the
 * identity stamps, its node coordinates and its edges in order.
 */
export const buildAnnotationContentSignature = (
  state: AnnotationsRuntimePersistenceEnvelope,
  annotationEntry: StoredAnnotation
): string => {
  const nodesById = new Map(state.tables.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(state.tables.edges.map((edge) => [edge.id, edge]));
  const {
    uuid: _uuid,
    updatedAt: _updatedAt,
    id: _id,
    nodeIds,
    edgeIds,
    ...rest
  } = annotationEntry;
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
 * Give every entry a uuid and an updatedAt: the uuid stays with the entry
 * (or is inherited from the previously stored entry of the same id), the
 * time moves only when the content signature changed since the last save.
 */
export const stampAnnotationIdentity = (
  state: AnnotationsRuntimePersistenceEnvelope,
  previous: AnnotationsRuntimePersistenceEnvelope | null,
  now: string = new Date().toISOString()
): AnnotationsRuntimePersistenceEnvelope => {
  const previousById = new Map(
    (previous?.tables.annotationEntries ?? []).map((entry) => [entry.id, entry])
  );
  const previousByUuid = new Map(
    (previous?.tables.annotationEntries ?? [])
      .filter((entry) => entry.uuid)
      .map((entry) => [entry.uuid as string, entry])
  );
  const annotationEntries = state.tables.annotationEntries.map((entry) => {
    const uuid =
      entry.uuid ?? previousById.get(entry.id)?.uuid ?? createAnnotationUuid();
    const before = previousByUuid.get(uuid) ?? previousById.get(entry.id);
    const unchanged =
      before !== undefined &&
      previous !== null &&
      buildAnnotationContentSignature(previous, before) ===
        buildAnnotationContentSignature(state, entry);
    return {
      ...entry,
      uuid,
      updatedAt: unchanged ? before?.updatedAt ?? entry.updatedAt ?? now : now,
    };
  });
  return { ...state, tables: { ...state.tables, annotationEntries } };
};

/**
 * Brings a parsed set of any known version to the current one: version 1 sets
 * get a uuid and an updatedAt per entry, the content stays as it is (the
 * heights were ellipsoidal already).
 */
export const upgradeAnnotationsRuntimePersistenceState = <
  T extends AnnotationsRuntimePersistenceEnvelope | null
>(
  state: T
): T => {
  if (!state) return state;
  const stamped = state.tables.annotationEntries.every(
    (entry) => entry.uuid && entry.updatedAt
  );
  if (state.version === ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION && stamped) {
    return state;
  }
  return {
    ...stampAnnotationIdentity(state, state),
    version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  } as T;
};
