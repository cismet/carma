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
  /** The stored sets (by storage key) that took this one already. */
  takenBy: Set<string>;
};

let pending: PendingSharedAnnotations | null = null;
let nextToken = 1;
const listeners = new Set<(pending: PendingSharedAnnotations) => void>();

export const publishSharedAnnotations = (collection: unknown): boolean => {
  const state =
    resolveAnnotationsRuntimePersistenceFromGeoJson(collection) ??
    parseAnnotationsRuntimePersistenceEnvelope(collection);
  if (!state || state.tables.annotationEntries.length === 0) return false;
  pending = { token: nextToken++, state, takenBy: new Set() };
  console.info(
    `[ANNOTATIONS] shared set of ${state.tables.annotationEntries.length} measurements pending, ${listeners.size} listener(s)`
  );
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

/**
 * Marks the pending set as imported into the stored set named by the
 * consumer key; true once per key and set. The set stays for providers that
 * mount later on another key (the Cesium and the MapLibre view keep their
 * own stored sets under a shared-url app key).
 */
export const consumeSharedAnnotations = (
  token: number,
  consumerKey: string
): boolean => {
  if (!pending || pending.token !== token || pending.takenBy.has(consumerKey)) {
    return false;
  }
  pending.takenBy.add(consumerKey);
  return true;
};
