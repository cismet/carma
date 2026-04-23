import { reconcileNodeLinks } from "../node-links.helpers";
import type {
  AnnotationsStoreState,
  StoredAnnotation,
  AnnotationEdge,
  AnnotationNodeLink,
  AnnotationNode,
} from "../annotations-store.types";
import type { AnnotationToolId } from "../../registry/annotation-tool-id";
import {
  normalizeAnnotationShortLabels,
  resolveNextShortLabelCounterByToolType,
} from "../../utils/short-label-sequence";

const currentPersistenceFormatId = "annotations-runtime-persistence" as const;
const currentPersistenceVersion = 1 as const;

export type AnnotationsRuntimePersistenceEnvelope = {
  formatId: typeof currentPersistenceFormatId;
  version: typeof currentPersistenceVersion;
  tables: {
    annotationEntries: StoredAnnotation[];
    nodes: AnnotationNode[];
    linkedNodeGroups: AnnotationNodeLink[];
    edges: AnnotationEdge[];
  };
  settings: {
    elevationReferenceAnnotationId: string | null;
    nextShortLabelCounterByToolType: Record<string, number>;
  };
};

type ResolvePersistedAnnotationsStoreStateArgs = {
  initialToolType: AnnotationToolId;
  initialPointTemporaryMode: boolean;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
};

const cloneAnnotationEntry = (
  annotationEntry: StoredAnnotation
): StoredAnnotation => {
  const { nodeIds, edgeIds, ...rest } = annotationEntry;

  return {
    ...rest,
    nodeIds: [...nodeIds],
    edgeIds: [...edgeIds],
  };
};

const cloneNode = (node: AnnotationNode): AnnotationNode => ({
  ...node,
  coordinate: { ...node.coordinate },
});

const cloneEdge = (edge: AnnotationEdge): AnnotationEdge => ({
  ...edge,
});

const cloneNodeLink = (nodeLink: AnnotationNodeLink): AnnotationNodeLink => ({
  ...nodeLink,
  nodeIds: [...nodeLink.nodeIds],
});

export const buildAnnotationsRuntimePersistenceState = (
  state: AnnotationsStoreState
): AnnotationsRuntimePersistenceEnvelope => {
  const annotationEntries = state.annotationEntries.map(cloneAnnotationEntry);
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
    formatId: currentPersistenceFormatId,
    version: currentPersistenceVersion,
    tables: {
      annotationEntries,
      nodes: filteredNodes,
      linkedNodeGroups: filteredNodeLinks,
      edges: state.edges
        .filter((edge) => usedEdgeIds.has(edge.id))
        .map(cloneEdge),
    },
    settings: {
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
}: ResolvePersistedAnnotationsStoreStateArgs): AnnotationsStoreState => {
  const persistedState =
    initialPersistenceState?.formatId === currentPersistenceFormatId &&
    initialPersistenceState?.version === currentPersistenceVersion
      ? initialPersistenceState
      : null;
  const persistedTables = persistedState?.tables;
  const normalizedAnnotationEntries = normalizeAnnotationShortLabels(
    persistedTables?.annotationEntries.map(cloneAnnotationEntry) ?? []
  );
  const normalizedNodes = persistedState?.tables.nodes.map(cloneNode) ?? [];
  const normalizedNodeLinks = reconcileNodeLinks({
    nodes: normalizedNodes,
    nodeLinks: persistedState?.tables.linkedNodeGroups.map(cloneNodeLink) ?? [],
  });
  const resolvedNextShortLabelCounterByToolType =
    resolveNextShortLabelCounterByToolType(normalizedAnnotationEntries);

  return {
    annotationToolType: initialToolType,
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

export const saveAnnotationsRuntimePersistenceState = (
  storageKey: string,
  state: AnnotationsRuntimePersistenceEnvelope
): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn(
      "Failed to save annotations runtime state to localStorage:",
      error
    );
  }
};

export const loadAnnotationsRuntimePersistenceState = (
  storageKey: string
): AnnotationsRuntimePersistenceEnvelope | null => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      formatId?: unknown;
      version?: unknown;
      tables?: {
        annotationEntries?: unknown;
        nodes?: unknown;
        linkedNodeGroups?: unknown;
        edges?: unknown;
      };
      settings?: {
        elevationReferenceAnnotationId?: unknown;
        nextShortLabelCounterByToolType?: unknown;
      };
    };
    if (
      parsed?.formatId !== currentPersistenceFormatId ||
      parsed?.version !== currentPersistenceVersion
    ) {
      return null;
    }

    if (
      !parsed.tables ||
      !Array.isArray(parsed.tables.annotationEntries) ||
      !Array.isArray(parsed.tables.nodes) ||
      !Array.isArray(parsed.tables.linkedNodeGroups) ||
      !Array.isArray(parsed.tables.edges)
    ) {
      return null;
    }

    return {
      formatId: currentPersistenceFormatId,
      version: currentPersistenceVersion,
      tables: {
        annotationEntries: parsed.tables.annotationEntries.map((entry) =>
          cloneAnnotationEntry(entry as StoredAnnotation)
        ),
        nodes: parsed.tables.nodes.map((node) =>
          cloneNode(node as AnnotationNode)
        ),
        linkedNodeGroups: parsed.tables.linkedNodeGroups.map((nodeLink) =>
          cloneNodeLink(nodeLink as AnnotationNodeLink)
        ),
        edges: parsed.tables.edges.map((edge) =>
          cloneEdge(edge as AnnotationEdge)
        ),
      },
      settings: {
        elevationReferenceAnnotationId:
          typeof parsed.settings?.elevationReferenceAnnotationId === "string"
            ? parsed.settings.elevationReferenceAnnotationId
            : null,
        nextShortLabelCounterByToolType:
          parsed.settings?.nextShortLabelCounterByToolType &&
          typeof parsed.settings.nextShortLabelCounterByToolType === "object"
            ? {
                ...parsed.settings.nextShortLabelCounterByToolType,
              }
            : {},
      },
    };
  } catch (error) {
    console.warn(
      "Failed to load annotations runtime state from localStorage:",
      error
    );
  }

  return null;
};
