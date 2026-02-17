import type {
  PointDistanceRelation,
  PlanarPolygonGroup,
  MeasurementCollection,
  MeasurementEntry,
  TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { MeasurementMode } from "../types/MeasurementTypes";

const DEFAULT_STORAGE_KEY = "cesium-measurements";
const DISTANCE_RELATIONS_STORAGE_SUFFIX = ":distance-relations";
const PLANAR_POLYGONS_STORAGE_SUFFIX = ":planar-polygons";

const rebuildTraverseEntry = (entry: MeasurementEntry): MeasurementEntry => {
  if (entry.type !== MeasurementMode.Traverse) {
    return entry;
  }

  const traverseEntry: TraverseMeasurementEntry = {
    ...(entry as TraverseMeasurementEntry),
    shouldRebuildEntry: true,
  };

  return traverseEntry;
};

export const saveMeasurements = (
  storageKey: string | undefined,
  measurements: MeasurementCollection
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
): MeasurementCollection | null => {
  const key = storageKey ?? DEFAULT_STORAGE_KEY;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return null;
    }

    const measurements = JSON.parse(saved) as MeasurementCollection;
    return measurements.map(rebuildTraverseEntry);
  } catch (error) {
    console.warn("Failed to load measurements from localStorage:", error);
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
    return relations;
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
