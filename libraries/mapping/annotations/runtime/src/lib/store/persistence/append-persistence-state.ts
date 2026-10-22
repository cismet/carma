import {
  appendAnnotationEntities,
  removeAnnotationById,
  removeAnnotationsByIds,
  updateAnnotationEntryById,
  type AnnotationsStore,
} from "../create-annotations-store";
import type { StoredAnnotation } from "../annotations-store.types";
import type { AppendAnnotationsRuntimePersistenceStateOptions } from "../../utils/annotation-tool-collections";
import type { AnnotationsRuntimePersistenceEnvelope } from "./persistence-format";
import {
  findCounterpartEntry,
  indexAnnotationEntries,
} from "./shared-annotations-merge";

type ExternalCollection = NonNullable<StoredAnnotation["externalCollection"]>;

const isInCollectionScope = (
  entry: StoredAnnotation,
  targetCollection: StoredAnnotation["externalCollection"]
) =>
  targetCollection
    ? entry.externalCollection?.type === targetCollection.type &&
      entry.externalCollection?.id === targetCollection.id
    : entry.externalCollection === undefined;

/** The tables rows an entry owns, with their ids passed through `mapId`. */
const collectEntryRows = (
  tables: AnnotationsRuntimePersistenceEnvelope["tables"],
  annotationEntry: StoredAnnotation,
  mapId: (id: string) => string
) => {
  const sourceNodeIds = new Set(annotationEntry.nodeIds);
  const sourceEdgeIds = new Set(annotationEntry.edgeIds);

  return {
    nodes: tables.nodes
      .filter((node) => sourceNodeIds.has(node.id))
      .map((node) => ({ ...node, id: mapId(node.id) })),
    edges: tables.edges
      .filter((edge) => sourceEdgeIds.has(edge.id))
      .map((edge) => ({
        ...edge,
        id: mapId(edge.id),
        startNodeId: mapId(edge.startNodeId),
        endNodeId: mapId(edge.endNodeId),
      })),
    linkedNodeGroups: tables.linkedNodeGroups
      .filter((nodeLink) =>
        nodeLink.nodeIds.some((nodeId) => sourceNodeIds.has(nodeId))
      )
      .map((nodeLink) => ({
        ...nodeLink,
        id: mapId(nodeLink.id),
        nodeIds: nodeLink.nodeIds
          .filter((nodeId) => sourceNodeIds.has(nodeId))
          .map(mapId),
      })),
  };
};

/** Appends the entries of a persisted state; returns the ids of the entries added. */
export const appendPersistenceStateToStore = (
  annotationsStore: AnnotationsStore,
  persistenceState: AnnotationsRuntimePersistenceEnvelope,
  options: AppendAnnotationsRuntimePersistenceStateOptions = {}
): readonly string[] => {
  const { annotationEntries: existingEntries, nodes: existingNodes } =
    annotationsStore.getState();
  const existingAnnotationIds = new Set(existingEntries.map(({ id }) => id));
  const existingNodeIds = new Set(existingNodes.map(({ id }) => id));
  // Counterparts live in the same scope: a saved collection's copy of a
  // measurement shares its uuid with the working measurement it was saved
  // from, and must neither replace nor relabel it.
  const scopedIndex = indexAnnotationEntries(
    existingEntries.filter((entry) =>
      isInCollectionScope(entry, options.externalCollection)
    )
  );
  const appendedAnnotationIds: string[] = [];

  for (const annotationEntry of persistenceState.tables.annotationEntries) {
    const counterpart = findCounterpartEntry(
      annotationEntry,
      scopedIndex,
      options.idPrefix
        ? `${options.idPrefix}:${annotationEntry.id}`
        : annotationEntry.id
    );
    if (counterpart && options.replaceExisting) {
      annotationsStore.dispatch(
        removeAnnotationById({ annotationId: counterpart.id })
      );
      existingAnnotationIds.delete(counterpart.id);
    }
    // Ids are per session: a foreign entry whose ids are taken locally gets a
    // prefix of its own, a replaced entry keeps its local id.
    const collides =
      !counterpart &&
      (existingAnnotationIds.has(annotationEntry.id) ||
        annotationEntry.nodeIds.some((nodeId) => existingNodeIds.has(nodeId)));
    const prefix =
      options.idPrefix ??
      (collides
        ? `s${(annotationEntry.uuid ?? annotationEntry.id)
            .replace(/[^a-z0-9]/gi, "")
            .slice(0, 8)}`
        : undefined);
    const mapId = (id: string) => (prefix ? `${prefix}:${id}` : id);
    const nextAnnotationId =
      counterpart && options.replaceExisting
        ? counterpart.id
        : mapId(annotationEntry.id);
    if (
      options.skipExisting &&
      !options.replaceExisting &&
      (counterpart !== undefined || existingAnnotationIds.has(nextAnnotationId))
    ) {
      if (
        options.annotationRole !== undefined ||
        options.readOnly !== undefined
      ) {
        annotationsStore.dispatch(
          updateAnnotationEntryById({
            annotationId: counterpart?.id ?? nextAnnotationId,
            annotationRole: options.annotationRole,
            readOnly: options.readOnly,
          })
        );
      }
      continue;
    }

    annotationsStore.dispatch(
      appendAnnotationEntities({
        annotationEntry: {
          ...annotationEntry,
          id: nextAnnotationId,
          nodeIds: annotationEntry.nodeIds.map(mapId),
          edgeIds: annotationEntry.edgeIds.map(mapId),
          annotationRole:
            options.annotationRole ?? annotationEntry.annotationRole,
          readOnly: options.readOnly ?? annotationEntry.readOnly,
          externalCollection:
            options.externalCollection ?? annotationEntry.externalCollection,
        },
        ...collectEntryRows(persistenceState.tables, annotationEntry, mapId),
        selectAnnotationId: options.selectAnnotationId,
      })
    );
    existingAnnotationIds.add(nextAnnotationId);
    appendedAnnotationIds.push(nextAnnotationId);
  }

  return appendedAnnotationIds;
};

/** Removes every entry of an external collection; returns the removed ids. */
export const removeExternalAnnotationsFromStore = (
  annotationsStore: AnnotationsStore,
  externalCollection: ExternalCollection
): readonly string[] => {
  const annotationIds = annotationsStore
    .getState()
    .annotationEntries.filter((annotationEntry) =>
      isInCollectionScope(annotationEntry, externalCollection)
    )
    .map((annotationEntry) => annotationEntry.id);

  if (annotationIds.length === 0) {
    return [];
  }

  annotationsStore.dispatch(
    removeAnnotationsByIds({
      annotationIds,
      nextSelectedAnnotationId: null,
    })
  );
  return annotationIds;
};
