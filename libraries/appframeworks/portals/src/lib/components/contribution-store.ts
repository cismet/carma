import { useSyncExternalStore } from "react";

/**
 * A keyed set of things contributed at runtime from outside the react tree
 * (through the carma api bridge) and read as state inside it (by the info
 * box). The same shape as the home view override: a module-level value with
 * subscribers.
 *
 * Keyed in insertion order, so a contributor that re-adds under its key (its
 * label or `active` changed) keeps its place among the others instead of
 * jumping to the end. The remover takes the entry out once, and only while it
 * is still the one that was added: a later re-add under the same key is not
 * removed by the earlier remover.
 */
export const createContributionStore = <T extends { key: string }>() => {
  const entries = new Map<string, T>();
  const listeners = new Set<() => void>();

  /** an immutable snapshot, so `useSyncExternalStore` sees a change per write */
  let snapshot: readonly T[] = [];

  const publish = () => {
    snapshot = Array.from(entries.values());
    for (const listener of listeners) {
      listener();
    }
  };

  const add = (entry: T): (() => void) => {
    entries.set(entry.key, entry);
    publish();
    return () => {
      if (entries.get(entry.key) === entry) {
        entries.delete(entry.key);
        publish();
      }
    };
  };

  const get = (): readonly T[] => snapshot;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const use = (): readonly T[] => useSyncExternalStore(subscribe, get, get);

  return { add, get, use };
};
