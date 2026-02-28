import type {
  AnnotationPersistenceEnvelopeV2,
  PointDistanceRelation,
  PlanarPolygonGroup,
  AnnotationCollection,
  AnnotationEntry,
  TraverseAnnotationEntry,
} from "../types/AnnotationTypes";
import { MEASUREMENT_MODE_TRAVERSE } from "../types/AnnotationTypes";

const DEFAULT_STORAGE_KEY = "cesium-measurements";
const DISTANCE_RELATIONS_STORAGE_SUFFIX = ":distance-relations";
const PLANAR_POLYGONS_STORAGE_SUFFIX = ":planar-polygons";
const NORMALIZED_STORAGE_SUFFIX = ":normalized-v2";

const getMeasurementEdgeId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `edge:${left}:${right}`;
};

const normalizeDistanceRelation = (
  relation: PointDistanceRelation
): PointDistanceRelation => ({
  ...relation,
  edgeId:
    relation.edgeId && relation.edgeId.length > 0
      ? relation.edgeId
      : getMeasurementEdgeId(relation.pointAId, relation.pointBId),
});

const rebuildTraverseEntry = (entry: AnnotationEntry): AnnotationEntry => {
  if (entry.type !== MEASUREMENT_MODE_TRAVERSE) {
    return entry;
  }

  const traverseEntry: TraverseAnnotationEntry = {
    ...(entry as TraverseAnnotationEntry),
    shouldRebuildEntry: true,
  };

  return traverseEntry;
};

export const saveMeasurements = (
  storageKey: string | undefined,
  measurements: AnnotationCollection
): void => {
  const key = storageKey ?? DEFAULT_STORAGE_KEY;
  try {
    localStorage.setItem(key, JSON.stringify(measurements));
  } catch (error) {
    console.warn("Failed to save measurements to localStorage:", error);
  }
};

export const loadMeasurements = (
  storageKey: string | undefined
): AnnotationCollection | null => {
  const key = storageKey ?? DEFAULT_STORAGE_KEY;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return null;
    }

    const measurements = JSON.parse(saved) as AnnotationCollection;
    return measurements.map(rebuildTraverseEntry);
  } catch (error) {
    console.warn("Failed to load measurements from localStorage:", error);
  }

  return null;
};

export const saveNormalizedMeasurements = (
  storageKey: string | undefined,
  state: AnnotationPersistenceEnvelopeV2
): void => {
  const key = `${
    storageKey ?? DEFAULT_STORAGE_KEY
  }${NORMALIZED_STORAGE_SUFFIX}`;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn(
      "Failed to save normalized measurements to localStorage:",
      error
    );
  }
};

export const loadNormalizedMeasurements = (
  storageKey: string | undefined
): AnnotationPersistenceEnvelopeV2 | null => {
  const key = `${
    storageKey ?? DEFAULT_STORAGE_KEY
  }${NORMALIZED_STORAGE_SUFFIX}`;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved) as AnnotationPersistenceEnvelopeV2;
    if (parsed?.version !== 2) return null;
    if (!parsed.geometry || !parsed.tables) return null;
    if (!Array.isArray(parsed.geometry.points)) return null;
    if (!Array.isArray(parsed.geometry.edges)) return null;
    if (!Array.isArray(parsed.tables.measurements)) return null;
    if (!Array.isArray(parsed.tables.distanceRelations)) return null;
    if (!Array.isArray(parsed.tables.planarPolygonGroups)) return null;
    if (!Array.isArray(parsed.tables.planarPolygonGroupVertices)) return null;

    return {
      ...parsed,
      tables: {
        ...parsed.tables,
        measurements: parsed.tables.measurements.map(rebuildTraverseEntry),
        distanceRelations: parsed.tables.distanceRelations.map(
          normalizeDistanceRelation
        ),
      },
    };
  } catch (error) {
    console.warn(
      "Failed to load normalized measurements from localStorage:",
      error
    );
  }

  return null;
};

export const saveDistanceRelations = (
  storageKey: string | undefined,
  relations: PointDistanceRelation[]
): void => {
  const key = `${
    storageKey ?? DEFAULT_STORAGE_KEY
  }${DISTANCE_RELATIONS_STORAGE_SUFFIX}`;
  try {
    localStorage.setItem(key, JSON.stringify(relations));
  } catch (error) {
    console.warn("Failed to save distance relations to localStorage:", error);
  }
};

export const loadDistanceRelations = (
  storageKey: string | undefined
): PointDistanceRelation[] | null => {
  const key = `${
    storageKey ?? DEFAULT_STORAGE_KEY
  }${DISTANCE_RELATIONS_STORAGE_SUFFIX}`;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return null;
    }

    const relations = JSON.parse(saved) as PointDistanceRelation[];
    if (!Array.isArray(relations)) return null;
    return relations.map(normalizeDistanceRelation);
  } catch (error) {
    console.warn("Failed to load distance relations from localStorage:", error);
  }

  return null;
};

export const savePlanarPolygonGroups = (
  storageKey: string | undefined,
  groups: PlanarPolygonGroup[]
): void => {
  const key = `${
    storageKey ?? DEFAULT_STORAGE_KEY
  }${PLANAR_POLYGONS_STORAGE_SUFFIX}`;
  try {
    localStorage.setItem(key, JSON.stringify(groups));
  } catch (error) {
    console.warn(
      "Failed to save planar polygon groups to localStorage:",
      error
    );
  }
};

export const loadPlanarPolygonGroups = (
  storageKey: string | undefined
): PlanarPolygonGroup[] | null => {
  const key = `${
    storageKey ?? DEFAULT_STORAGE_KEY
  }${PLANAR_POLYGONS_STORAGE_SUFFIX}`;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return null;
    }

    const groups = JSON.parse(saved) as PlanarPolygonGroup[];
    if (!Array.isArray(groups)) return null;
    return groups;
  } catch (error) {
    console.warn(
      "Failed to load planar polygon groups from localStorage:",
      error
    );
  }

  return null;
};
