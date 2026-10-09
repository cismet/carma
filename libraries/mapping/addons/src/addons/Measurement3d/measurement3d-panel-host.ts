import { useSyncExternalStore } from "react";

/**
 * The ribbon the host renders for the row lives outside the addon's React
 * tree, while the toolbar needs the addon's annotation runtime. The panel
 * publishes its element here and the addon portals the toolbar into it, which
 * keeps the toolbar inside the runtime's context.
 */
let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

export const setMeasurement3dPanelHost = (element: HTMLElement | null) => {
  if (host === element) return;
  host = element;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useMeasurement3dPanelHost = (): HTMLElement | null =>
  useSyncExternalStore(
    subscribe,
    () => host,
    () => null
  );
