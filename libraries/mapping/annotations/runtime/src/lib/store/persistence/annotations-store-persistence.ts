import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import { selectAuthoringAnnotationEntries } from "../../utils/annotation-tool-collections";
import {
  normalizeAnnotationShortLabels,
  resolveNextShortLabelCounterByToolType,
} from "../../utils/short-label-sequence";
import type {
  AnnotationEdge,
  AnnotationNode,
  AnnotationNodeLink,
  AnnotationsStoreState,
  StoredAnnotation,
} from "../annotations-store.types";
import { reconcileNodeLinks } from "../node-links.helpers";
import { withAnnotationUuid } from "./annotation-identity";
import {
  buildAnnotationsRuntimeGeoJsonFeatureCollection,
  parseAnnotationsRuntimeGeoJsonFeatures,
} from "./annotations-geojson";
import {
  cloneAnnotationEntry,
  cloneEdge,
  cloneNode,
  cloneNodeLink,
  readAnnotationEntry,
} from "./persistence-clone";
import {
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  KNOWN_GEOJSON_FORMAT_VERSIONS,
  KNOWN_PERSISTENCE_VERSIONS,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./persistence-format";

export { buildAnnotationContentSignature } from "./annotation-identity";
export { buildAnnotationsRuntimeGeoJsonFeatureCollection } from "./annotations-geojson";
export {
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./persistence-format";
export {
  filterAnnotationsRuntimePersistenceState,
  resolveSharedAnnotationsMerge,
  type SharedAnnotationsConflict,
  type SharedAnnotationsMerge,
} from "./shared-annotations-merge";

type ResolvePersistedAnnotationsStoreStateArgs = {
  initialToolType: AnnotationToolId;
  initialPointTemporaryMode: boolean;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
  isToolTypeAvailable?: (toolType: AnnotationToolId) => boolean;
};

export const parseAnnotationsRuntimePersistenceEnvelope = (
  parsed: unknown
): AnnotationsRuntimePersistenceEnvelope | null => {
  const candidate = parsed as {
    formatId?: unknown;
    version?: unknown;
    tables?: {
      annotationEntries?: unknown;
      nodes?: unknown;
      linkedNodeGroups?: unknown;
      edges?: unknown;
    };
    settings?: {
      lastActiveToolType?: unknown;
      elevationReferenceAnnotationId?: unknown;
      nextShortLabelCounterByToolType?: unknown;
    };
  };

  if (
    candidate?.formatId !== ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID ||
    typeof candidate.version !== "number" ||
    !KNOWN_PERSISTENCE_VERSIONS.has(candidate.version)
  ) {
    return null;
  }

  if (
    !candidate.tables ||
    !Array.isArray(candidate.tables.annotationEntries) ||
    !Array.isArray(candidate.tables.nodes) ||
    !Array.isArray(candidate.tables.linkedNodeGroups) ||
    !Array.isArray(candidate.tables.edges)
  ) {
    return null;
  }

  return {
    formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
    version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
    tables: {
      annotationEntries: candidate.tables.annotationEntries.map((entry) =>
        readAnnotationEntry(entry as StoredAnnotation)
      ),
      nodes: candidate.tables.nodes.map((node) =>
        cloneNode(node as AnnotationNode)
      ),
      linkedNodeGroups: candidate.tables.linkedNodeGroups.map((nodeLink) =>
        cloneNodeLink(nodeLink as AnnotationNodeLink)
      ),
      edges: candidate.tables.edges.map((edge) =>
        cloneEdge(edge as AnnotationEdge)
      ),
    },
    settings: {
      lastActiveToolType:
        typeof candidate.settings?.lastActiveToolType === "string"
          ? (candidate.settings.lastActiveToolType as AnnotationToolId)
          : null,
      elevationReferenceAnnotationId:
        typeof candidate.settings?.elevationReferenceAnnotationId === "string"
          ? candidate.settings.elevationReferenceAnnotationId
          : null,
      nextShortLabelCounterByToolType:
        candidate.settings?.nextShortLabelCounterByToolType &&
        typeof candidate.settings.nextShortLabelCounterByToolType === "object"
          ? {
              ...candidate.settings.nextShortLabelCounterByToolType,
            }
          : {},
    },
  };
};

export const resolveAnnotationsRuntimePersistenceFromGeoJson = (
  parsed: unknown
): AnnotationsRuntimePersistenceEnvelope | null => {
  const candidate = parsed as {
    type?: unknown;
    metadata?: {
      carmaConf?: {
        formatId?: unknown;
        formatVersion?: unknown;
        annotationsRuntimePersistence?: unknown;
      };
    };
  };
  if (candidate?.type !== "FeatureCollection") {
    return null;
  }

  const carmaConf = candidate.metadata?.carmaConf;
  const envelope =
    carmaConf?.formatId === ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID &&
    typeof carmaConf.formatVersion === "number" &&
    KNOWN_GEOJSON_FORMAT_VERSIONS.has(carmaConf.formatVersion)
      ? parseAnnotationsRuntimePersistenceEnvelope(
          carmaConf.annotationsRuntimePersistence
        )
      : null;

  return envelope ?? parseAnnotationsRuntimeGeoJsonFeatures(parsed);
};

export const buildAnnotationsRuntimePersistenceState = (
  state: AnnotationsStoreState
): AnnotationsRuntimePersistenceEnvelope => {
  const annotationEntries =
    selectAuthoringAnnotationEntries(state).map(cloneAnnotationEntry);
  const usedNodeIds = new Set(
    annotationEntries.flatMap((annotationEntry) => annotationEntry.nodeIds)
  );
  const usedEdgeIds = new Set(
    annotationEntries.flatMap((annotationEntry) => annotationEntry.edgeIds)
  );
  const filteredNodes = state.nodes
    .filter((node) => usedNodeIds.has(node.id))
    .map(cloneNode);
  const filteredNodeLinks = reconcileNodeLinks({
    nodes: filteredNodes,
    nodeLinks: state.linkedNodeGroups
      .map(cloneNodeLink)
      .filter((nodeLink) =>
        nodeLink.nodeIds.some((nodeId) => usedNodeIds.has(nodeId))
      ),
  });

  return {
    formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
    version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
    tables: {
      annotationEntries,
      nodes: filteredNodes,
      linkedNodeGroups: filteredNodeLinks,
      edges: state.edges
        .filter((edge) => usedEdgeIds.has(edge.id))
        .map(cloneEdge),
    },
    settings: {
      lastActiveToolType: state.annotationToolType,
      elevationReferenceAnnotationId:
        state.settingsState.elevationReferenceAnnotationId,
      nextShortLabelCounterByToolType:
        resolveNextShortLabelCounterByToolType(annotationEntries),
    },
  };
};

export const resolvePersistedAnnotationsStoreState = ({
  initialToolType,
  initialPointTemporaryMode,
  initialPersistenceState,
  isToolTypeAvailable,
}: ResolvePersistedAnnotationsStoreStateArgs): AnnotationsStoreState => {
  const persistedState =
    initialPersistenceState?.formatId ===
      ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID &&
    KNOWN_PERSISTENCE_VERSIONS.has(initialPersistenceState.version)
      ? initialPersistenceState
      : null;
  const persistedTables = persistedState?.tables;
  // Entries of older sets get their uuid here; the next save writes it.
  const normalizedAnnotationEntries = normalizeAnnotationShortLabels(
    persistedTables?.annotationEntries.map((entry) =>
      withAnnotationUuid(readAnnotationEntry(entry))
    ) ?? []
  );
  const normalizedNodes = persistedState?.tables.nodes.map(cloneNode) ?? [];
  const normalizedNodeLinks = reconcileNodeLinks({
    nodes: normalizedNodes,
    nodeLinks: persistedState?.tables.linkedNodeGroups.map(cloneNodeLink) ?? [],
  });
  const resolvedNextShortLabelCounterByToolType =
    resolveNextShortLabelCounterByToolType(normalizedAnnotationEntries);
  const persistedActiveToolType =
    typeof persistedState?.settings.lastActiveToolType === "string" &&
    (isToolTypeAvailable?.(persistedState.settings.lastActiveToolType) ?? true)
      ? persistedState.settings.lastActiveToolType
      : null;

  return {
    annotationToolType: persistedActiveToolType ?? initialToolType,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
    },
    annotationEntries: normalizedAnnotationEntries,
    nodes: normalizedNodes,
    linkedNodeGroups: normalizedNodeLinks,
    edges: persistedTables?.edges.map(cloneEdge) ?? [],
    infoBoxState: {
      activeAnnotationId: null,
    },
    settingsState: {
      pointTemporaryMode: initialPointTemporaryMode,
      elevationReferenceAnnotationId:
        persistedState?.settings.elevationReferenceAnnotationId ?? null,
      nextShortLabelCounterByToolType: resolvedNextShortLabelCounterByToolType,
    },
  };
};

export const loadAnnotationsRuntimePersistenceState = (
  storageKey: string
): AnnotationsRuntimePersistenceEnvelope | null => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    return (
      resolveAnnotationsRuntimePersistenceFromGeoJson(parsed) ??
      parseAnnotationsRuntimePersistenceEnvelope(parsed)
    );
  } catch (error) {
    console.warn(
      "Failed to load annotations runtime state from localStorage:",
      error
    );
  }

  return null;
};

export const saveAnnotationsRuntimePersistenceState = (
  storageKey: string,
  state: AnnotationsRuntimePersistenceEnvelope
): void => {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(buildAnnotationsRuntimeGeoJsonFeatureCollection(state))
    );
  } catch (error) {
    console.warn(
      "Failed to save annotations runtime state to localStorage:",
      error
    );
  }
};

/** The stored GeoJSON collection for sharing it on, as it is stored. */
export const loadAnnotationsRuntimeGeoJsonFeatureCollection = (
  storageKey: string
): AnnotationsRuntimeGeoJsonFeatureCollection | null => {
  const state = loadAnnotationsRuntimePersistenceState(storageKey);
  return state ? buildAnnotationsRuntimeGeoJsonFeatureCollection(state) : null;
};
