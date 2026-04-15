import {
  withDistanceRelationEdgeId,
  type AnnotationPersistenceEnvelopeBase,
  type BaseAnnotationEntry,
} from "@carma-mapping/annotations/core";

type PersistedAnnotationEntry = BaseAnnotationEntry<string>;
type PersistedAnnotationEnvelope<TEntry extends PersistedAnnotationEntry> =
  AnnotationPersistenceEnvelopeBase<TEntry>;

const DEFAULT_STORAGE_KEY = "cesium-annotations";
const LEGACY_DEFAULT_STORAGE_KEY = "cesium-measurements";
const LEGACY_PERSISTENCE_STORAGE_SUFFIX = ":normalized-runtime";

const getStorageKey = (storageKey: string | undefined) =>
  storageKey ?? DEFAULT_STORAGE_KEY;

const getLegacyStorageKey = (storageKey: string | undefined) =>
  storageKey ?? LEGACY_DEFAULT_STORAGE_KEY;

const getLegacyPersistenceStorageKey = (storageKey: string | undefined) =>
  `${getStorageKey(storageKey)}${LEGACY_PERSISTENCE_STORAGE_SUFFIX}`;

export const saveAnnotationPersistenceState = (
  storageKey: string | undefined,
  state: PersistedAnnotationEnvelope<PersistedAnnotationEntry>
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
): PersistedAnnotationEnvelope<TEntry> | null => {
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

      const parsed = JSON.parse(saved) as PersistedAnnotationEnvelope<TEntry>;
      if (parsed?.version !== 2) continue;
      if (!parsed.geometry || !parsed.tables) continue;
      if (!Array.isArray(parsed.geometry.points)) continue;
      if (!Array.isArray(parsed.geometry.edges)) continue;
      const rawAnnotations =
        parsed.tables.annotations ??
        (parsed.tables as { measurements?: unknown }).measurements;
      if (!Array.isArray(rawAnnotations)) continue;
      if (!Array.isArray(parsed.tables.distanceRelations)) continue;
      if (!Array.isArray(parsed.tables.nodeChainAnnotations)) continue;
      if (!Array.isArray(parsed.tables.planarPolygonGroupVertices)) continue;

      return {
        ...parsed,
        tables: {
          ...parsed.tables,
          annotations: rawAnnotations as TEntry[],
          distanceRelations: parsed.tables.distanceRelations.map(
            withDistanceRelationEdgeId
          ),
        },
      };
    }
  } catch (error) {
    console.warn("Failed to load annotation state from localStorage:", error);
  }

  return null;
};
