import type { StoredAnnotation } from "../annotations-store.types";
import { buildAnnotationContentSignature } from "./annotation-identity";
import type { AnnotationsRuntimePersistenceEnvelope } from "./persistence-format";

export type SharedAnnotationsConflict = {
  uuid: string;
  incoming: StoredAnnotation;
  local: StoredAnnotation;
};

export type SharedAnnotationsMerge = {
  /** Entries the local set does not know: by uuid, or by id while a side has none. */
  additions: AnnotationsRuntimePersistenceEnvelope;
  /** Entries both sides know under one uuid but with different content. */
  conflicts: AnnotationsRuntimePersistenceEnvelope;
  conflictPairs: SharedAnnotationsConflict[];
  unchangedCount: number;
};

/** The envelope reduced to the entries the predicate keeps, with their nodes, edges and links. */
export const filterAnnotationsRuntimePersistenceState = (
  state: AnnotationsRuntimePersistenceEnvelope,
  keep: (annotationEntry: StoredAnnotation) => boolean
): AnnotationsRuntimePersistenceEnvelope => {
  const annotationEntries = state.tables.annotationEntries.filter(keep);
  const nodeIds = new Set(annotationEntries.flatMap((entry) => entry.nodeIds));
  const edgeIds = new Set(annotationEntries.flatMap((entry) => entry.edgeIds));
  return {
    ...state,
    tables: {
      annotationEntries,
      nodes: state.tables.nodes.filter((node) => nodeIds.has(node.id)),
      edges: state.tables.edges.filter((edge) => edgeIds.has(edge.id)),
      linkedNodeGroups: state.tables.linkedNodeGroups.filter((nodeLink) =>
        nodeLink.nodeIds.some((nodeId) => nodeIds.has(nodeId))
      ),
    },
  };
};

/**
 * Sort a shared set against the local one: same uuid and same content is
 * nothing new, same uuid and other content is a conflict for the user to
 * settle, everything else joins.
 */
export const resolveSharedAnnotationsMerge = (
  incoming: AnnotationsRuntimePersistenceEnvelope,
  local: AnnotationsRuntimePersistenceEnvelope | null
): SharedAnnotationsMerge => {
  const localEntries = local?.tables.annotationEntries ?? [];
  const localByUuid = new Map(
    localEntries
      .filter((entry) => entry.uuid)
      .map((entry) => [entry.uuid as string, entry])
  );
  const localById = new Map(localEntries.map((entry) => [entry.id, entry]));
  const additionIds = new Set<string>();
  const conflictIds = new Set<string>();
  const conflictPairs: SharedAnnotationsConflict[] = [];
  let unchangedCount = 0;
  for (const entry of incoming.tables.annotationEntries) {
    // By uuid; by id only while one side has no uuid yet (sets saved before
    // the stamps), never across two different uuids.
    const byId = localById.get(entry.id);
    const counterpart =
      (entry.uuid && localByUuid.get(entry.uuid)) ||
      (byId && (!entry.uuid || !byId.uuid) ? byId : undefined);
    if (!counterpart) {
      additionIds.add(entry.id);
      continue;
    }
    const same =
      local !== null &&
      buildAnnotationContentSignature(incoming, entry) ===
        buildAnnotationContentSignature(local, counterpart);
    if (same) {
      unchangedCount += 1;
      continue;
    }
    conflictIds.add(entry.id);
    conflictPairs.push({
      uuid: entry.uuid ?? entry.id,
      incoming: entry,
      local: counterpart,
    });
  }
  return {
    additions: filterAnnotationsRuntimePersistenceState(incoming, (entry) =>
      additionIds.has(entry.id)
    ),
    conflicts: filterAnnotationsRuntimePersistenceState(incoming, (entry) =>
      conflictIds.has(entry.id)
    ),
    conflictPairs,
    unchangedCount,
  };
};
