import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type { FeatureCollection, Geometry } from "geojson";

import type {
  AnnotationEdge,
  AnnotationNode,
  AnnotationNodeLink,
  StoredAnnotation,
} from "../annotations-store.types";

export const ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID =
  "annotations-runtime-persistence" as const;
/**
 * Sets are written as version 1, the format every release reads; an entry may
 * carry a uuid that older readers keep as an unknown field. Version 2 sets
 * (preview deployments: entries with uuid and updatedAt) are still read.
 */
export const ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION = 1 as const;
export const KNOWN_PERSISTENCE_VERSIONS: ReadonlySet<number> = new Set([1, 2]);

export const ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID =
  "carma-3d-annotations-geojson" as const;
export const ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION = 1 as const;
export const KNOWN_GEOJSON_FORMAT_VERSIONS: ReadonlySet<number> = new Set([
  1, 2,
]);

export const ANNOTATIONS_RUNTIME_FEATURE_FORMAT_ID =
  "carma-3d-annotation-runtime-feature" as const;
export const ANNOTATIONS_RUNTIME_FEATURE_FORMAT_VERSION = 1 as const;

export type AnnotationsRuntimePersistenceEnvelope = {
  formatId: typeof ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID;
  version: typeof ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION;
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
