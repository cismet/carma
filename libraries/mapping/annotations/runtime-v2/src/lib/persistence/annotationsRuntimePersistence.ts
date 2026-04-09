import type {
  AnnotationsStoreState,
  RuntimeAnnotationEntry,
  RuntimeEdge,
  RuntimeNode,
} from "../store";
import type { RuntimeToolId } from "../types/runtimeTool.types";

export type AnnotationsRuntimePersistenceEnvelopeV1 = {
  version: 1;
  tables: {
    annotationEntries: RuntimeAnnotationEntry[];
    nodes: RuntimeNode[];
    edges: RuntimeEdge[];
  };
};

export type AnnotationsRuntimePersistenceEnvelopeV2 = {
  version: 2;
  tables: {
    annotationEntries: RuntimeAnnotationEntry[];
    nodes: RuntimeNode[];
    edges: RuntimeEdge[];
  };
  settings: {
    elevationReferenceAnnotationId: string | null;
  };
};

export type AnnotationsRuntimePersistenceEnvelope =
  | AnnotationsRuntimePersistenceEnvelopeV1
  | AnnotationsRuntimePersistenceEnvelopeV2;

type ResolvePersistedAnnotationsStoreStateArgs = {
  initialToolType: RuntimeToolId;
  initialSelectionModeActive: boolean;
  initialPointTemporaryMode: boolean;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
};

const cloneAnnotationEntry = (
  annotationEntry: RuntimeAnnotationEntry
): RuntimeAnnotationEntry => ({
  ...annotationEntry,
  nodeIds: [...annotationEntry.nodeIds],
  edgeIds: [...annotationEntry.edgeIds],
});

const cloneNode = (node: RuntimeNode): RuntimeNode => ({
  ...node,
  coordinate: { ...node.coordinate },
});

const cloneEdge = (edge: RuntimeEdge): RuntimeEdge => ({
  ...edge,
});

export const buildAnnotationsRuntimePersistenceState = (
  state: AnnotationsStoreState
): AnnotationsRuntimePersistenceEnvelopeV2 => {
  const annotationEntries = state.annotationEntries
    .filter((annotationEntry) => !annotationEntry.temporary)
    .map(cloneAnnotationEntry);
  const usedNodeIds = new Set(
    annotationEntries.flatMap((annotationEntry) => annotationEntry.nodeIds)
  );
  const usedEdgeIds = new Set(
    annotationEntries.flatMap((annotationEntry) => annotationEntry.edgeIds)
  );

  return {
    version: 2,
    tables: {
      annotationEntries,
      nodes: state.nodes
        .filter((node) => usedNodeIds.has(node.id))
        .map(cloneNode),
      edges: state.edges
        .filter((edge) => usedEdgeIds.has(edge.id))
        .map(cloneEdge),
    },
    settings: {
      elevationReferenceAnnotationId:
        state.settingsState.elevationReferenceAnnotationId,
    },
  };
};

export const resolvePersistedAnnotationsStoreState = ({
  initialToolType,
  initialSelectionModeActive,
  initialPointTemporaryMode,
  initialPersistenceState,
}: ResolvePersistedAnnotationsStoreStateArgs): AnnotationsStoreState => {
  const persistedTables = initialPersistenceState?.tables;

  return {
    annotationToolType: initialToolType,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
      selectionModeActive: initialSelectionModeActive,
      selectModeAdditive: false,
      selectModeRectangle: false,
    },
    annotationEntries:
      persistedTables?.annotationEntries.map(cloneAnnotationEntry) ?? [],
    nodes: persistedTables?.nodes.map(cloneNode) ?? [],
    edges: persistedTables?.edges.map(cloneEdge) ?? [],
    infoBoxState: {
      activeAnnotationId: null,
    },
    settingsState: {
      pointTemporaryMode: initialPointTemporaryMode,
      elevationReferenceAnnotationId:
        initialPersistenceState?.version === 2
          ? initialPersistenceState.settings.elevationReferenceAnnotationId
          : null,
    },
    draftState: {
      draftCoordinatesByToolType: {},
      pendingAnnotationIdByToolType: {},
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
      "Failed to save annotations runtime v2 state to localStorage:",
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

    const parsed = JSON.parse(raw) as AnnotationsRuntimePersistenceEnvelope;
    if (parsed?.version !== 1 && parsed?.version !== 2) {
      return null;
    }

    if (!parsed.tables) {
      return null;
    }

    if (
      !Array.isArray(parsed.tables.annotationEntries) ||
      !Array.isArray(parsed.tables.nodes) ||
      !Array.isArray(parsed.tables.edges)
    ) {
      return null;
    }

    if (parsed.version === 2) {
      return {
        version: 2,
        tables: {
          annotationEntries:
            parsed.tables.annotationEntries.map(cloneAnnotationEntry),
          nodes: parsed.tables.nodes.map(cloneNode),
          edges: parsed.tables.edges.map(cloneEdge),
        },
        settings: {
          elevationReferenceAnnotationId:
            parsed.settings?.elevationReferenceAnnotationId ?? null,
        },
      };
    }

    return {
      version: 1,
      tables: {
        annotationEntries:
          parsed.tables.annotationEntries.map(cloneAnnotationEntry),
        nodes: parsed.tables.nodes.map(cloneNode),
        edges: parsed.tables.edges.map(cloneEdge),
      },
    };
  } catch (error) {
    console.warn(
      "Failed to load annotations runtime v2 state from localStorage:",
      error
    );
  }

  return null;
};
