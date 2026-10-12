import {
  CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT,
  inspectAnnotationsPersistenceFormat,
} from "./annotations-persistence-format";
import {
  loadAnnotationsRuntimePersistenceState,
  saveAnnotationsRuntimePersistenceState,
} from "./annotations-store-persistence";

const pendingRequests = new Map<string, Promise<void>>();
const keepChoiceKey = (storageKey: string) =>
  `${storageKey}::persistence-format-choice`;

export const requestAnnotationsFormatUpgrade = (
  storageKey: string,
  confirmUpgrade: () => Promise<boolean>
): Promise<void> => {
  const pending = pendingRequests.get(storageKey);
  if (pending) return pending;
  let signature: string;
  try {
    const raw = localStorage.getItem(storageKey);
    const format = raw
      ? inspectAnnotationsPersistenceFormat(JSON.parse(raw))
      : null;
    if (
      !format ||
      JSON.stringify(format) ===
        JSON.stringify(CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT)
    ) {
      return Promise.resolve();
    }
    signature = JSON.stringify(format);
    if (localStorage.getItem(keepChoiceKey(storageKey)) === signature)
      return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
  const request = Promise.resolve()
    .then(confirmUpgrade)
    .then((upgrade) => {
      if (!upgrade) {
        localStorage.setItem(keepChoiceKey(storageKey), signature);
        return;
      }
      // Read the latest payload: a caller may have edited while the choice was pending.
      const state = loadAnnotationsRuntimePersistenceState(storageKey);
      if (!state) return;
      saveAnnotationsRuntimePersistenceState(
        storageKey,
        state,
        CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT
      );
      const raw = localStorage.getItem(storageKey);
      const format = raw
        ? inspectAnnotationsPersistenceFormat(JSON.parse(raw))
        : null;
      if (
        JSON.stringify(format) ===
        JSON.stringify(CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT)
      ) {
        localStorage.removeItem(keepChoiceKey(storageKey));
      }
    })
    .catch((error) => {
      console.warn("Could not apply the measurement format choice:", error);
    })
    .finally(() => {
      pendingRequests.delete(storageKey);
    });
  pendingRequests.set(storageKey, request);
  return request;
};
