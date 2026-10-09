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
import { createAnnotationUuid } from "../../utils/annotation-uuid";
import { selectAuthoringAnnotationEntries } from "../../utils/annotation-tool-collections";

const currentPersistenceFormatId = "annotations-runtime-persistence" as const;
/**
 * Persistence versions: 1 is the Cesium measurement as stored up to now
 * (entries without identity), 2 adds a uuid and an updatedAt per entry. A
 * stored or shared set of any known version loads and comes out current.
 */
export const ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION = 2 as const;
const currentPersistenceVersion = ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION;
const KNOWN_PERSISTENCE_VERSIONS: ReadonlySet<number> = new Set([1, 2]);
export const ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID =
  "carma-3d-annotations-geojson" as const;
export const ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION = 2 as const;
const KNOWN_GEOJSON_FORMAT_VERSIONS: ReadonlySet<number> = new Set([1, 2]);
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
    candidate?.formatId !== currentPersistenceFormatId ||
    typeof candidate.version !== "number" ||
    !KNOWN_PERSISTENCE_VERSIONS.has(candidate.version)
  ) {
    return null;
  }
  const parsedVersion = candidate.version;

  if (
    !candidate.tables ||
    !Array.isArray(candidate.tables.annotationEntries) ||
    !Array.isArray(candidate.tables.nodes) ||
    !Array.isArray(candidate.tables.linkedNodeGroups) ||
    !Array.isArray(candidate.tables.edges)
  ) {
    return null;
  }

  return upgradeAnnotationsRuntimePersistenceState({
    formatId: currentPersistenceFormatId,
    version: parsedVersion as typeof currentPersistenceVersion,
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
  });
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
    typeof carmaConf.formatVersion === "number" &&
    KNOWN_GEOJSON_FORMAT_VERSIONS.has(carmaConf.formatVersion)
  ) {
    return (
      parseAnnotationsRuntimePersistenceEnvelope(
        carmaConf.annotationsRuntimePersistence
      ) ?? upgradeAnnotationsRuntimePersistenceState(parseAnnotationsRuntimeGeoJsonFeatures(parsed))
    );
  }

  // The first Cesium measurement format: plain features, no envelope.
  return upgradeAnnotationsRuntimePersistenceState(
    parseAnnotationsRuntimeGeoJsonFeatures(parsed)
  );
};

/**
 * Brings a parsed set of any known version to the current one. Version 1
 * sets (the Cesium measurement up to now, and the plain feature format
 * before it) get a uuid and an updatedAt per entry; the content is kept as
 * it is, since Cesium stored ellipsoidal heights all along.
 */
export const upgradeAnnotationsRuntimePersistenceState = <
  T extends AnnotationsRuntimePersistenceEnvelope | null,
>(
  state: T
): T => {
  if (!state) return state;
  const stamped = state.tables.annotationEntries.every(
    (entry) => entry.uuid && entry.updatedAt
  );
  if (state.version === currentPersistenceVersion && stamped) return state;
  return {
    ...stampAnnotationIdentity(state, state),
    version: currentPersistenceVersion,
  } as T;
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
  // Any known version loads; older ones come through the upgrade path.
  const persistedState =
    initialPersistenceState?.formatId === currentPersistenceFormatId &&
    KNOWN_PERSISTENCE_VERSIONS.has(initialPersistenceState.version)
      ? upgradeAnnotationsRuntimePersistenceState(initialPersistenceState)
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
  const { uuid: _uuid, updatedAt: _updatedAt, id: _id, nodeIds, edgeIds, ...rest } =
    annotationEntry;
  return JSON.stringify({
    entry: rest,
    nodes: nodeIds.map((nodeId) => {
      const node = nodesById.get(nodeId);
      return node ? [node.coordinate.longitude, node.coordinate.latitude, node.coordinate.altitude] : null;
    }),
    edges: edgeIds.map((edgeId) => {
      const edge = edgesById.get(edgeId);
      return edge ? [nodeIds.indexOf(edge.startNodeId), nodeIds.indexOf(edge.endNodeId)] : null;
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
    const uuid = entry.uuid ?? previousById.get(entry.id)?.uuid ?? createAnnotationUuid();
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
    localEntries.filter((entry) => entry.uuid).map((entry) => [entry.uuid as string, entry])
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

/**
 * The stored GeoJSON collection for sharing it on. A set saved before the
 * identity stamps gets them now and is written back, so the local copy and
 * the shared one agree on every uuid.
 */
export const loadAnnotationsRuntimeGeoJsonFeatureCollection = (
  storageKey: string
): AnnotationsRuntimeGeoJsonFeatureCollection | null => {
  const state = loadAnnotationsRuntimePersistenceState(storageKey);
  if (!state) return null;
  const unstamped = state.tables.annotationEntries.some(
    (entry) => !entry.uuid || !entry.updatedAt
  );
  const stamped = unstamped ? stampAnnotationIdentity(state, state) : state;
  if (unstamped) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(buildAnnotationsRuntimeGeoJsonFeatureCollection(stamped))
      );
    } catch {
      // the share still carries the stamps; the next save writes them locally
    }
  }
  return buildAnnotationsRuntimeGeoJsonFeatureCollection(stamped);
};

export const saveAnnotationsRuntimePersistenceState = (
  storageKey: string,
  state: AnnotationsRuntimePersistenceEnvelope
): void => {
  try {
    const stamped = stampAnnotationIdentity(
      state,
      loadAnnotationsRuntimePersistenceState(storageKey)
    );
    localStorage.setItem(
      storageKey,
      JSON.stringify(buildAnnotationsRuntimeGeoJsonFeatureCollection(stamped))
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
