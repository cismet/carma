import type { StoredAnnotation } from "../annotations-store.types";
import { buildAnnotationsRuntimeGeoJsonFeatureCollection } from "./annotations-geojson";
import {
  cloneAnnotationEntry,
  cloneEdge,
  cloneNode,
  cloneNodeLink,
} from "./persistence-clone";
import {
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
  ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./persistence-format";

export const ANNOTATIONS_PERSISTENCE_FORMAT_KINDS = Object.freeze({
  ENVELOPE: "envelope",
  GEOJSON: "geojson",
} as const);

export type AnnotationsPersistenceVersion = 1 | 2;

export type AnnotationsPersistenceFormat =
  | {
      kind: typeof ANNOTATIONS_PERSISTENCE_FORMAT_KINDS.ENVELOPE;
      persistenceVersion: AnnotationsPersistenceVersion;
    }
  | {
      kind: typeof ANNOTATIONS_PERSISTENCE_FORMAT_KINDS.GEOJSON;
      persistenceVersion: AnnotationsPersistenceVersion;
      geoJsonVersion: AnnotationsPersistenceVersion;
    };

/** The format for a new storage key, independent of any existing format choice. */
export const CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT = Object.freeze({
  kind: ANNOTATIONS_PERSISTENCE_FORMAT_KINDS.GEOJSON,
  persistenceVersion: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  geoJsonVersion: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
} as const);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isKnownVersion = (
  value: unknown
): value is AnnotationsPersistenceVersion => value === 1 || value === 2;

const inspectEnvelopeVersion = (
  value: unknown
): AnnotationsPersistenceVersion | null => {
  if (
    !isRecord(value) ||
    value.formatId !== ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID ||
    !isKnownVersion(value.version) ||
    !isRecord(value.tables) ||
    !Array.isArray(value.tables.annotationEntries) ||
    !Array.isArray(value.tables.nodes) ||
    !Array.isArray(value.tables.linkedNodeGroups) ||
    !Array.isArray(value.tables.edges)
  ) {
    return null;
  }
  return value.version;
};

/** Reads the stored shape without loading, stamping or upgrading its entries. */
export const inspectAnnotationsPersistenceFormat = (
  value: unknown
): AnnotationsPersistenceFormat | null => {
  const persistenceVersion = inspectEnvelopeVersion(value);
  if (persistenceVersion !== null) {
    return {
      kind: ANNOTATIONS_PERSISTENCE_FORMAT_KINDS.ENVELOPE,
      persistenceVersion,
    };
  }
  if (
    !isRecord(value) ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features) ||
    !isRecord(value.metadata) ||
    !isRecord(value.metadata.carmaConf)
  ) {
    return null;
  }
  const { carmaConf } = value.metadata;
  if (
    carmaConf.formatId !== ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID ||
    !isKnownVersion(carmaConf.formatVersion)
  ) {
    return null;
  }
  const nestedVersion = inspectEnvelopeVersion(
    carmaConf.annotationsRuntimePersistence
  );
  return nestedVersion === null
    ? null
    : {
        kind: ANNOTATIONS_PERSISTENCE_FORMAT_KINDS.GEOJSON,
        persistenceVersion: nestedVersion,
        geoJsonVersion: carmaConf.formatVersion,
      };
};

const cloneEntryForVersion = (
  entry: StoredAnnotation,
  version: AnnotationsPersistenceVersion
): StoredAnnotation => {
  const cloned = cloneAnnotationEntry(entry);
  if (version === 2) return cloned;
  const { uuid: _uuid, updatedAt: _updatedAt, ...legacyEntry } = cloned;
  return legacyEntry;
};

/** Encodes the selected format; the caller decides whether to keep or upgrade it. */
export const serializeAnnotationsPersistenceState = (
  state: AnnotationsRuntimePersistenceEnvelope,
  target: AnnotationsPersistenceFormat
): unknown => {
  const snapshot: AnnotationsRuntimePersistenceEnvelope = {
    ...state,
    tables: {
      ...state.tables,
      annotationEntries: state.tables.annotationEntries.map((entry) =>
        cloneEntryForVersion(entry, target.persistenceVersion)
      ),
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
  };
  if (target.kind === ANNOTATIONS_PERSISTENCE_FORMAT_KINDS.ENVELOPE) {
    return { ...snapshot, version: target.persistenceVersion };
  }
  // Build from the already adapted entries, so legacy features omit identity too.
  const collection = buildAnnotationsRuntimeGeoJsonFeatureCollection(snapshot);
  const { carmaConf } = collection.metadata;
  return {
    ...collection,
    metadata: {
      ...collection.metadata,
      carmaConf: {
        ...carmaConf,
        formatVersion: target.geoJsonVersion,
        annotationsRuntimePersistence: {
          ...carmaConf.annotationsRuntimePersistence,
          version: target.persistenceVersion,
        },
      },
    },
  };
};
