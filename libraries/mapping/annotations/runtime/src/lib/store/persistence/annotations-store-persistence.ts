import { reconcileNodeLinks } from "../node-links.helpers";
import type {
  AnnotationsStoreState,
  StoredAnnotation,
  AnnotationEdge,
  AnnotationNodeLink,
  AnnotationNode,
} from "../annotations-store.types";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import {
  normalizeAnnotationShortLabels,
  resolveNextShortLabelCounterByToolType,
} from "../../utils/short-label-sequence";
import type { FeatureCollection, Geometry } from "geojson";
import { buildStoredAnnotationsGeoJsonFeatureCollection } from "../../utils/annotation-geo-json-export";

const currentPersistenceFormatId = "annotations-runtime-persistence" as const;
const currentPersistenceVersion = 1 as const;
export const ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID =
  "carma-3d-annotations-geojson" as const;
export const ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION = 1 as const;
const annotationsRuntimeFeatureFormatId =
  "carma-3d-annotation-runtime-feature" as const;
const annotationsRuntimeFeatureFormatVersion = 1 as const;

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
    lastActiveToolType: AnnotationToolId | null;
    elevationReferenceAnnotationId: string | null;
    nextShortLabelCounterByToolType: Record<string, number>;
  };
};

export type AnnotationsRuntimeGeoJsonFeatureCollection = FeatureCollection<
  Geometry,
  Record<string, unknown>
> & {
  metadata: {
    carmaConf: {
      formatId: typeof ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID;
      formatVersion: typeof ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION;
      source: "geoportal-cesium-annotations";
      annotationsRuntimePersistence: AnnotationsRuntimePersistenceEnvelope;
    };
  };
};

type ResolvePersistedAnnotationsStoreStateArgs = {
  initialToolType: AnnotationToolId;
  initialPointTemporaryMode: boolean;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
  isToolTypeAvailable?: (toolType: AnnotationToolId) => boolean;
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

const parseAnnotationsRuntimePersistenceEnvelope = (
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
    candidate?.formatId !== currentPersistenceFormatId ||
    candidate?.version !== currentPersistenceVersion
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
    formatId: currentPersistenceFormatId,
    version: currentPersistenceVersion,
    tables: {
      annotationEntries: candidate.tables.annotationEntries.map((entry) =>
        cloneAnnotationEntry(entry as StoredAnnotation)
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readFeatureAnnotationRuntime = (
  feature: unknown
): {
  annotation: StoredAnnotation;
  nodes: AnnotationNode[];
  linkedNodeGroups: AnnotationNodeLink[];
  edges: AnnotationEdge[];
} | null => {
  if (!isRecord(feature) || !isRecord(feature.properties)) {
    return null;
  }

  const { carmaConf } = feature.properties;
  if (!isRecord(carmaConf) || !isRecord(carmaConf.annotationRuntime)) {
    return null;
  }

  const annotationRuntime = carmaConf.annotationRuntime;
  if (
    annotationRuntime.formatId !== annotationsRuntimeFeatureFormatId ||
    annotationRuntime.formatVersion !==
      annotationsRuntimeFeatureFormatVersion ||
    !isRecord(annotationRuntime.annotation) ||
    !Array.isArray(annotationRuntime.nodes) ||
    !Array.isArray(annotationRuntime.linkedNodeGroups) ||
    !Array.isArray(annotationRuntime.edges)
  ) {
    return null;
  }

  return {
    annotation: cloneAnnotationEntry(
      annotationRuntime.annotation as StoredAnnotation
    ),
    nodes: annotationRuntime.nodes.map((node) =>
      cloneNode(node as AnnotationNode)
    ),
    linkedNodeGroups: annotationRuntime.linkedNodeGroups.map((nodeLink) =>
      cloneNodeLink(nodeLink as AnnotationNodeLink)
    ),
    edges: annotationRuntime.edges.map((edge) =>
      cloneEdge(edge as AnnotationEdge)
    ),
  };
};

const parseAnnotationsRuntimeGeoJsonFeatures = (
  parsed: unknown
): AnnotationsRuntimePersistenceEnvelope | null => {
  if (!isRecord(parsed) || parsed.type !== "FeatureCollection") {
    return null;
  }

  const features = parsed.features;
  if (!Array.isArray(features)) {
    return null;
  }

  const annotationEntries: StoredAnnotation[] = [];
  const nodeById = new Map<string, AnnotationNode>();
  const nodeLinkById = new Map<string, AnnotationNodeLink>();
  const edgeById = new Map<string, AnnotationEdge>();

  for (const feature of features) {
    const annotationRuntime = readFeatureAnnotationRuntime(feature);
    if (!annotationRuntime) {
      continue;
    }

    annotationEntries.push(annotationRuntime.annotation);
    for (const node of annotationRuntime.nodes) {
      nodeById.set(node.id, node);
    }
    for (const nodeLink of annotationRuntime.linkedNodeGroups) {
      nodeLinkById.set(nodeLink.id, nodeLink);
    }
    for (const edge of annotationRuntime.edges) {
      edgeById.set(edge.id, edge);
    }
  }

  if (annotationEntries.length === 0) {
    return null;
  }

  const normalizedAnnotationEntries =
    normalizeAnnotationShortLabels(annotationEntries);

  return {
    formatId: currentPersistenceFormatId,
    version: currentPersistenceVersion,
    tables: {
      annotationEntries: normalizedAnnotationEntries.map(cloneAnnotationEntry),
      nodes: [...nodeById.values()].map(cloneNode),
      linkedNodeGroups: reconcileNodeLinks({
        nodes: [...nodeById.values()],
        nodeLinks: [...nodeLinkById.values()].map(cloneNodeLink),
      }),
      edges: [...edgeById.values()].map(cloneEdge),
    },
    settings: {
      lastActiveToolType: null,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: resolveNextShortLabelCounterByToolType(
        normalizedAnnotationEntries
      ),
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
  const carmaConf = candidate?.metadata?.carmaConf;

  if (candidate?.type !== "FeatureCollection") {
    return null;
  }

  if (
    carmaConf?.formatId === ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID &&
    carmaConf?.formatVersion === ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION
  ) {
    return (
      parseAnnotationsRuntimePersistenceEnvelope(
        carmaConf.annotationsRuntimePersistence
      ) ?? parseAnnotationsRuntimeGeoJsonFeatures(parsed)
    );
  }

  return parseAnnotationsRuntimeGeoJsonFeatures(parsed);
};

export const buildAnnotationsRuntimeGeoJsonFeatureCollection = (
  state: AnnotationsRuntimePersistenceEnvelope
): AnnotationsRuntimeGeoJsonFeatureCollection => {
  const nodesById = new Map(
    state.tables.nodes.map((node) => [node.id, node] as const)
  );
  const annotationById = new Map(
    state.tables.annotationEntries.map(
      (annotation) => [annotation.id, annotation] as const
    )
  );
  const edgesById = new Map(
    state.tables.edges.map((edge) => [edge.id, edge] as const)
  );
  const nodeLinksByNodeId = new Map<string, AnnotationNodeLink[]>();
  for (const nodeLink of state.tables.linkedNodeGroups) {
    for (const nodeId of nodeLink.nodeIds) {
      const nodeLinks = nodeLinksByNodeId.get(nodeId) ?? [];
      nodeLinks.push(nodeLink);
      nodeLinksByNodeId.set(nodeId, nodeLinks);
    }
  }
  const featureCollection = buildStoredAnnotationsGeoJsonFeatureCollection({
    annotations: state.tables.annotationEntries.map((annotation) => ({
      annotation,
      coordinates: annotation.nodeIds.flatMap((nodeId) => {
        const coordinate = nodesById.get(nodeId)?.coordinate;
        return coordinate ? [coordinate] : [];
      }),
    })),
  });
  const features = (featureCollection?.features ?? []).map((feature) => {
    const annotationId =
      typeof feature.id === "string"
        ? feature.id
        : typeof feature.properties?.annotationId === "string"
        ? feature.properties.annotationId
        : null;
    const annotation = annotationId ? annotationById.get(annotationId) : null;
    if (!annotation) {
      return feature;
    }

    const nodeIdSet = new Set(annotation.nodeIds);
    const linkedNodeGroupIds = new Set<string>();
    const linkedNodeGroups = annotation.nodeIds.flatMap((nodeId) =>
      (nodeLinksByNodeId.get(nodeId) ?? []).flatMap((nodeLink) => {
        if (linkedNodeGroupIds.has(nodeLink.id)) {
          return [];
        }
        linkedNodeGroupIds.add(nodeLink.id);
        return [cloneNodeLink(nodeLink)];
      })
    );
    const properties = feature.properties ?? {};
    const carmaConf = isRecord(properties.carmaConf)
      ? properties.carmaConf
      : {};

    return {
      ...feature,
      properties: {
        ...properties,
        carmaConf: {
          ...carmaConf,
          annotationRuntime: {
            formatId: annotationsRuntimeFeatureFormatId,
            formatVersion: annotationsRuntimeFeatureFormatVersion,
            annotation: cloneAnnotationEntry(annotation),
            nodes: annotation.nodeIds.flatMap((nodeId) => {
              const node = nodesById.get(nodeId);
              return node ? [cloneNode(node)] : [];
            }),
            linkedNodeGroups,
            edges: annotation.edgeIds.flatMap((edgeId) => {
              const edge = edgesById.get(edgeId);
              if (
                !edge ||
                !nodeIdSet.has(edge.startNodeId) ||
                !nodeIdSet.has(edge.endNodeId)
              ) {
                return [];
              }
              return [cloneEdge(edge)];
            }),
          },
        },
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      carmaConf: {
        formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
        formatVersion: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
        source: "geoportal-cesium-annotations",
        annotationsRuntimePersistence: {
          formatId: currentPersistenceFormatId,
          version: currentPersistenceVersion,
          tables: {
            annotationEntries:
              state.tables.annotationEntries.map(cloneAnnotationEntry),
            nodes: state.tables.nodes.map(cloneNode),
            linkedNodeGroups: state.tables.linkedNodeGroups.map(cloneNodeLink),
            edges: state.tables.edges.map(cloneEdge),
          },
          settings: {
            ...state.settings,
            nextShortLabelCounterByToolType: {
              ...state.settings.nextShortLabelCounterByToolType,
            },
          },
        },
      },
    },
  };
};

export const buildAnnotationsRuntimePersistenceState = (
  state: AnnotationsStoreState
): AnnotationsRuntimePersistenceEnvelope => {
  const annotationEntries = state.annotationEntries
    .filter((annotationEntry) => !annotationEntry.readOnlySource)
    .map(cloneAnnotationEntry);
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
