import { buildStoredAnnotationsGeoJsonFeatureCollection } from "../../utils/annotation-geo-json-export";
import {
  normalizeAnnotationShortLabels,
  resolveNextShortLabelCounterByToolType,
} from "../../utils/short-label-sequence";
import type {
  AnnotationEdge,
  AnnotationNode,
  AnnotationNodeLink,
  StoredAnnotation,
} from "../annotations-store.types";
import { reconcileNodeLinks } from "../node-links.helpers";
import {
  cloneAnnotationEntry,
  cloneEdge,
  cloneNode,
  cloneNodeLink,
  readAnnotationEntry,
} from "./persistence-clone";
import {
  ANNOTATIONS_RUNTIME_FEATURE_FORMAT_ID,
  ANNOTATIONS_RUNTIME_FEATURE_FORMAT_VERSION,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
  ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./persistence-format";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type FeatureAnnotationRuntime = {
  annotation: StoredAnnotation;
  nodes: AnnotationNode[];
  linkedNodeGroups: AnnotationNodeLink[];
  edges: AnnotationEdge[];
};

const readFeatureAnnotationRuntime = (
  feature: unknown
): FeatureAnnotationRuntime | null => {
  if (!isRecord(feature) || !isRecord(feature.properties)) {
    return null;
  }

  const { carmaConf } = feature.properties;
  if (!isRecord(carmaConf) || !isRecord(carmaConf.annotationRuntime)) {
    return null;
  }

  const annotationRuntime = carmaConf.annotationRuntime;
  if (
    annotationRuntime.formatId !== ANNOTATIONS_RUNTIME_FEATURE_FORMAT_ID ||
    annotationRuntime.formatVersion !==
      ANNOTATIONS_RUNTIME_FEATURE_FORMAT_VERSION ||
    !isRecord(annotationRuntime.annotation) ||
    !Array.isArray(annotationRuntime.nodes) ||
    !Array.isArray(annotationRuntime.linkedNodeGroups) ||
    !Array.isArray(annotationRuntime.edges)
  ) {
    return null;
  }

  return {
    annotation: readAnnotationEntry(
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

/** The envelope rebuilt from the per-feature runtime properties of a plain FeatureCollection. */
export const parseAnnotationsRuntimeGeoJsonFeatures = (
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
    formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
    version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
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
            formatId: ANNOTATIONS_RUNTIME_FEATURE_FORMAT_ID,
            formatVersion: ANNOTATIONS_RUNTIME_FEATURE_FORMAT_VERSION,
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
          formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
          version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
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
