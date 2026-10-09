import { useSyncExternalStore } from "react";

/**
 * What the layer-bar row of the 3D measurement can do with the running
 * runtime: the row lives in the host's layer bar, outside the annotations
 * provider, so the runtime publishes its actions here and the row reads them.
 */
export type Measurement3dRowActions = {
  /** Measurements of the user, the ones the actions apply to. */
  count: number;
  focusAll: () => void;
  exportAll: () => void;
  deleteAll: (options?: { skipConfirmation?: boolean }) => void;
};

let current: Measurement3dRowActions | null = null;
const listeners = new Set<() => void>();

export const setMeasurement3dRowActions = (
  next: Measurement3dRowActions | null
) => {
  current = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Null while no measurement runtime is mounted. */
export const useMeasurement3dRowActions = () =>
  useSyncExternalStore(subscribe, () => current, () => null);
