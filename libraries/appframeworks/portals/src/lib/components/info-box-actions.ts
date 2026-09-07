import { useSyncExternalStore } from "react";

import type { InfoBoxAction } from "@carma-api";

/**
 * The buttons contributed to the selected feature's info box at runtime, the
 * store behind `carma.ui.addInfoBoxAction`.
 *
 * The same shape as the home view override: a module-level value with
 * subscribers, so the bridge writes it from outside the react tree and the
 * info box reads it as state. Keyed by the action's `key` in insertion order,
 * so a contributor that re-adds its action (its label or `active` changed)
 * keeps its place among the others instead of jumping to the end.
 */

const actions = new Map<string, InfoBoxAction>();
const listeners = new Set<() => void>();

/** an immutable snapshot, so `useSyncExternalStore` sees a change per write */
let snapshot: readonly InfoBoxAction[] = [];

const publish = () => {
  snapshot = Array.from(actions.values());
  for (const listener of listeners) {
    listener();
  }
};

/** add or replace an action; the remover takes it out again, once */
export const addInfoBoxAction = (action: InfoBoxAction): (() => void) => {
  actions.set(action.key, action);
  publish();
  return () => {
    if (actions.get(action.key) === action) {
      actions.delete(action.key);
      publish();
    }
  };
};

export const getInfoBoxActions = (): readonly InfoBoxAction[] => snapshot;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** the contributed actions as react state, for the info box that renders them */
export const useInfoBoxActions = (): readonly InfoBoxAction[] =>
  useSyncExternalStore(subscribe, getInfoBoxActions, getInfoBoxActions);
