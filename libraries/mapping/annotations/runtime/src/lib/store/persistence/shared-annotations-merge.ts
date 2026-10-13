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

export type AnnotationEntryIndex = {
  byUuid: ReadonlyMap<string, StoredAnnotation>;
  byId: ReadonlyMap<string, StoredAnnotation>;
};

export const indexAnnotationEntries = (
  entries: readonly StoredAnnotation[]
): AnnotationEntryIndex => ({
  byUuid: new Map(
    entries
      .filter((entry) => entry.uuid)
      .map((entry) => [entry.uuid as string, entry])
  ),
  byId: new Map(entries.map((entry) => [entry.id, entry])),
});

/**
 * The local entry an incoming one stands for: the one with its uuid, else the
 * one with its id (`localId`, default the incoming id) while either side
 * carries no uuid; never across two different uuids.
 */
export const findCounterpartEntry = (
  incoming: StoredAnnotation,
  local: AnnotationEntryIndex,
  localId: string = incoming.id
): StoredAnnotation | undefined => {
  const sameId = local.byId.get(localId);
  return (
    (incoming.uuid && local.byUuid.get(incoming.uuid)) ||
    (sameId && (!incoming.uuid || !sameId.uuid) ? sameId : undefined)
  );
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
  const localIndex = indexAnnotationEntries(
    local?.tables.annotationEntries ?? []
  );
  const additionIds = new Set<string>();
  const conflictIds = new Set<string>();
  const conflictPairs: SharedAnnotationsConflict[] = [];
  let unchangedCount = 0;
  for (const entry of incoming.tables.annotationEntries) {
    const counterpart = findCounterpartEntry(entry, localIndex);
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
