import type { BaseAnnotationEntry } from "../types/annotationEntry";
import type { AnnotationPersistenceEnvelopeV2Base } from "../types/annotationPersistenceTypes";
import type { PointDistanceRelation } from "../types/distanceRelation";

type PersistedAnnotationEntry = BaseAnnotationEntry<string>;
type PersistedAnnotationEnvelopeV2<TEntry extends PersistedAnnotationEntry> =
  AnnotationPersistenceEnvelopeV2Base<TEntry>;

const DEFAULT_STORAGE_KEY = "cesium-annotations";
const LEGACY_DEFAULT_STORAGE_KEY = "cesium-measurements";
const LEGACY_PERSISTENCE_STORAGE_SUFFIX = ":normalized-v2";

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

const getStorageKey = (storageKey: string | undefined) =>
  storageKey ?? DEFAULT_STORAGE_KEY;

const getLegacyStorageKey = (storageKey: string | undefined) =>
  storageKey ?? LEGACY_DEFAULT_STORAGE_KEY;

const getLegacyPersistenceStorageKey = (storageKey: string | undefined) =>
  `${getStorageKey(storageKey)}${LEGACY_PERSISTENCE_STORAGE_SUFFIX}`;

export const saveAnnotationPersistenceState = (
  storageKey: string | undefined,
  state: PersistedAnnotationEnvelopeV2<PersistedAnnotationEntry>
): void => {
  const key = getStorageKey(storageKey);
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn("Failed to save annotation state to localStorage:", error);
  }
};

export const loadAnnotationPersistenceState = <
  TEntry extends PersistedAnnotationEntry
>(
  storageKey: string | undefined
): PersistedAnnotationEnvelopeV2<TEntry> | null => {
  const key = getStorageKey(storageKey);
  try {
    const candidateKeys = [
      key,
      getLegacyStorageKey(storageKey),
      getLegacyPersistenceStorageKey(storageKey),
    ].filter((candidate, index, all) => all.indexOf(candidate) === index);

    for (const candidateKey of candidateKeys) {
      const saved = localStorage.getItem(candidateKey);
      if (!saved) continue;

      const parsed = JSON.parse(saved) as PersistedAnnotationEnvelopeV2<TEntry>;
      if (parsed?.version !== 2) continue;
      if (!parsed.geometry || !parsed.tables) continue;
      if (!Array.isArray(parsed.geometry.points)) continue;
      if (!Array.isArray(parsed.geometry.edges)) continue;
      const rawAnnotations =
        parsed.tables.annotations ??
        (parsed.tables as { measurements?: unknown }).measurements;
      if (!Array.isArray(rawAnnotations)) continue;
      if (!Array.isArray(parsed.tables.distanceRelations)) continue;
      if (!Array.isArray(parsed.tables.planarPolygonGroups)) continue;
      if (!Array.isArray(parsed.tables.planarPolygonGroupVertices)) continue;

      return {
        ...parsed,
        tables: {
          ...parsed.tables,
          annotations: rawAnnotations as TEntry[],
          distanceRelations: parsed.tables.distanceRelations.map(
            normalizeDistanceRelation
          ),
        },
      };
    }
  } catch (error) {
    console.warn("Failed to load annotation state from localStorage:", error);
  }

  return null;
};
