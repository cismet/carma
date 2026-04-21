import type { AnnotationToolType } from "@carma-mapping/annotations/core";
import {
  buildNodeLinksFromLegacyNodes,
  reconcileNodeLinks,
  type AnnotationsStoreState,
  type LegacyAnnotationNodeWithLinkedGroupId,
  type StoredAnnotation,
  type AnnotationEdge,
  type AnnotationNodeLink,
  type AnnotationNode,
} from "../store";
import {
  normalizeAnnotationShortLabels,
  resolveNextShortLabelCounterByToolType,
} from "../utils/short-label-sequence";

export type AnnotationsRuntimePersistenceEnvelopeLegacy = {
  version: 1;
  tables: {
    annotationEntries: StoredAnnotation[];
    nodes: LegacyAnnotationNodeWithLinkedGroupId[];
    edges: AnnotationEdge[];
  };
};

export type AnnotationsRuntimePersistenceEnvelopeWithElevationReference = {
  version: 2;
  tables: {
    annotationEntries: StoredAnnotation[];
    nodes: LegacyAnnotationNodeWithLinkedGroupId[];
    edges: AnnotationEdge[];
  };
  settings: {
    elevationReferenceAnnotationId: string | null;
  };
};

export type AnnotationsRuntimePersistenceEnvelopeV3 = {
  version: 3;
  tables: {
    annotationEntries: StoredAnnotation[];
    nodes: LegacyAnnotationNodeWithLinkedGroupId[];
    edges: AnnotationEdge[];
  };
  settings: {
    elevationReferenceAnnotationId: string | null;
    nextShortLabelCounterByToolType: Record<string, number>;
  };
};

export type AnnotationsRuntimePersistenceEnvelopeV4 = {
  version: 4;
  tables: {
    annotationEntries: StoredAnnotation[];
    nodes: LegacyAnnotationNodeWithLinkedGroupId[];
    edges: AnnotationEdge[];
  };
  settings: {
    elevationReferenceAnnotationId: string | null;
    nextShortLabelCounterByToolType: Record<string, number>;
  };
};

export type AnnotationsRuntimePersistenceEnvelopeV5 = {
  version: 5;
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

export type AnnotationsRuntimePersistenceEnvelope =
  | AnnotationsRuntimePersistenceEnvelopeLegacy
  | AnnotationsRuntimePersistenceEnvelopeWithElevationReference
  | AnnotationsRuntimePersistenceEnvelopeV3
  | AnnotationsRuntimePersistenceEnvelopeV4
  | AnnotationsRuntimePersistenceEnvelopeV5;

type ResolvePersistedAnnotationsStoreStateArgs = {
  initialToolType: AnnotationToolType;
  initialPointTemporaryMode: boolean;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
};

type LegacyStoredAnnotation = StoredAnnotation & {
  areaSquareMeters?: number;
  verticalityDeg?: number;
  bearingDeg?: number;
};

const cloneAnnotationEntry = (
  annotationEntry: LegacyStoredAnnotation
): StoredAnnotation => {
  const {
    areaSquareMeters: _legacyAreaSquareMeters,
    verticalityDeg: _legacyVerticalityDeg,
    bearingDeg: legacyBearingDeg,
    preferredNormalBearingDeg,
    nodeIds,
    edgeIds,
    ...rest
  } = annotationEntry;

  return Number.isFinite(preferredNormalBearingDeg ?? legacyBearingDeg)
    ? {
        ...rest,
        preferredNormalBearingDeg:
          preferredNormalBearingDeg ?? legacyBearingDeg,
        nodeIds: [...nodeIds],
        edgeIds: [...edgeIds],
      }
    : {
        ...rest,
        nodeIds: [...nodeIds],
        edgeIds: [...edgeIds],
      };
};

const cloneNode = (node: AnnotationNode): AnnotationNode => ({
  ...node,
  coordinate: { ...node.coordinate },
});

const cloneLegacyNode = (
  node: LegacyAnnotationNodeWithLinkedGroupId
): LegacyAnnotationNodeWithLinkedGroupId => ({
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
): AnnotationsRuntimePersistenceEnvelopeV5 => {
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
    version: 5,
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
  const persistedTables = initialPersistenceState?.tables;
  const normalizedAnnotationEntries = normalizeAnnotationShortLabels(
    persistedTables?.annotationEntries.map(cloneAnnotationEntry) ?? []
  );
  const persistedLegacyNodes =
    initialPersistenceState?.version === 5
      ? []
      : persistedTables?.nodes.map(cloneLegacyNode) ?? [];
  const normalizedNodes =
    initialPersistenceState?.version === 5
      ? initialPersistenceState.tables.nodes.map(cloneNode)
      : persistedLegacyNodes.map((node) => ({
          id: node.id,
          coordinate: { ...node.coordinate },
        }));
  const normalizedNodeLinks = reconcileNodeLinks({
    nodes: normalizedNodes,
    nodeLinks:
      initialPersistenceState?.version === 5
        ? initialPersistenceState.tables.linkedNodeGroups.map(cloneNodeLink)
        : buildNodeLinksFromLegacyNodes(persistedLegacyNodes),
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
        initialPersistenceState?.version === 2 ||
        initialPersistenceState?.version === 3 ||
        initialPersistenceState?.version === 4 ||
        initialPersistenceState?.version === 5
          ? initialPersistenceState.settings.elevationReferenceAnnotationId
          : null,
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

    const parsed = JSON.parse(raw) as AnnotationsRuntimePersistenceEnvelope;
    if (
      parsed?.version !== 1 &&
      parsed?.version !== 2 &&
      parsed?.version !== 3 &&
      parsed?.version !== 4 &&
      parsed?.version !== 5
    ) {
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

    if (parsed.version === 5) {
      if (!Array.isArray(parsed.tables.linkedNodeGroups)) {
        return null;
      }

      return {
        version: 5,
        tables: {
          annotationEntries:
            parsed.tables.annotationEntries.map(cloneAnnotationEntry),
          nodes: parsed.tables.nodes.map(cloneNode),
          linkedNodeGroups: parsed.tables.linkedNodeGroups.map(cloneNodeLink),
          edges: parsed.tables.edges.map(cloneEdge),
        },
        settings: {
          elevationReferenceAnnotationId:
            parsed.settings?.elevationReferenceAnnotationId ?? null,
          nextShortLabelCounterByToolType: {
            ...(parsed.settings?.nextShortLabelCounterByToolType ?? {}),
          },
        },
      };
    }

    if (parsed.version === 4) {
      return {
        version: 4,
        tables: {
          annotationEntries:
            parsed.tables.annotationEntries.map(cloneAnnotationEntry),
          nodes: parsed.tables.nodes.map(cloneLegacyNode),
          edges: parsed.tables.edges.map(cloneEdge),
        },
        settings: {
          elevationReferenceAnnotationId:
            parsed.settings?.elevationReferenceAnnotationId ?? null,
          nextShortLabelCounterByToolType: {
            ...(parsed.settings?.nextShortLabelCounterByToolType ?? {}),
          },
        },
      };
    }

    if (parsed.version === 3) {
      return {
        version: 3,
        tables: {
          annotationEntries:
            parsed.tables.annotationEntries.map(cloneAnnotationEntry),
          nodes: parsed.tables.nodes.map(cloneLegacyNode),
          edges: parsed.tables.edges.map(cloneEdge),
        },
        settings: {
          elevationReferenceAnnotationId:
            parsed.settings?.elevationReferenceAnnotationId ?? null,
          nextShortLabelCounterByToolType: {
            ...(parsed.settings?.nextShortLabelCounterByToolType ?? {}),
          },
        },
      };
    }

    if (parsed.version === 2) {
      return {
        version: 2,
        tables: {
          annotationEntries:
            parsed.tables.annotationEntries.map(cloneAnnotationEntry),
          nodes: parsed.tables.nodes.map(cloneLegacyNode),
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
        nodes: parsed.tables.nodes.map(cloneLegacyNode),
        edges: parsed.tables.edges.map(cloneEdge),
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
