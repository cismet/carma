import { useSyncExternalStore } from "react";

import type { ShareableViewState } from "../../types";

export type HomeViewOverride = Partial<ShareableViewState> &
  Pick<ShareableViewState, "lat" | "lng"> & {
    tooltip?: string;
    overlayLabel?: string;
    overlayDestination?: string;
  };

let current: HomeViewOverride | null = null;
const listeners = new Set<() => void>();

/**
 * Take the home position over, or hand it back with `null`. The last writer
 * wins, so whoever sets one is responsible for clearing it again.
 */
export const setHomeViewOverride = (view: HomeViewOverride | null): void => {
  if (current === view) {
    return;
  }
  current = view;
  for (const listener of listeners) {
    listener();
  }
};

/** the effective override, or `null` while the app's own home applies */
export const getHomeViewOverride = (): HomeViewOverride | null => current;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** the override as react state, so a home button re-renders when it changes */
export const useHomeViewOverride = (): HomeViewOverride | null =>
  useSyncExternalStore(subscribe, getHomeViewOverride, getHomeViewOverride);
