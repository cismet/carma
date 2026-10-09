import {
  parseAnnotationsRuntimePersistenceEnvelope,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type AnnotationsRuntimePersistenceEnvelope,
} from "../store/persistence/annotations-store-persistence";

/**
 * Measurements that arrived with a shared configuration wait here until a
 * mounted annotations runtime takes them: the host receives the config
 * before the measurement providers exist, and whichever engine's provider
 * mounts first (Cesium or MapLibre, same stored set) imports them once.
 */
type PendingSharedAnnotations = {
  token: number;
  state: AnnotationsRuntimePersistenceEnvelope;
};

let pending: PendingSharedAnnotations | null = null;
let nextToken = 1;
const listeners = new Set<(pending: PendingSharedAnnotations) => void>();

export const publishSharedAnnotations = (collection: unknown): boolean => {
  const state =
    resolveAnnotationsRuntimePersistenceFromGeoJson(collection) ??
    parseAnnotationsRuntimePersistenceEnvelope(collection);
  if (!state || state.tables.annotationEntries.length === 0) return false;
  pending = { token: nextToken++, state };
  for (const listener of listeners) listener(pending);
  return true;
};

export const subscribeSharedAnnotations = (
  listener: (pending: PendingSharedAnnotations) => void
): (() => void) => {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
};

/** Marks the pending set as imported; true when it was still the one given. */
export const consumeSharedAnnotations = (token: number): boolean => {
  if (!pending || pending.token !== token) return false;
  pending = null;
  return true;
};
