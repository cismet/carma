import { useCallback, useContext, useSyncExternalStore } from "react";

import {
  AddonListContext,
  AddonScopeContext,
  AddonStateSetterContext,
  AddonStateStoreContext,
} from "@carma-mapping/contexts";

import type { AddonEntry, AddonStateKey, AddonStateMap } from "./registry";

export type AddonStateAction<K extends AddonStateKey> =
  | AddonStateMap[K]
  | ((previous: AddonStateMap[K] | undefined) => AddonStateMap[K]);

export const useAddonState = <K extends AddonStateKey>(
  key: K
): [AddonStateMap[K] | undefined, (action: AddonStateAction<K>) => void] => {
  const store = useContext(AddonStateStoreContext);
  const subscribe = useCallback(
    (notify: () => void) => store.subscribe(key, notify),
    [store, key]
  );
  const getSnapshot = useCallback(
    () => store.getSnapshot()[key] as AddonStateMap[K] | undefined,
    [store, key]
  );
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useContext(AddonStateSetterContext);
  const setValue = useCallback(
    (action: AddonStateAction<K>) => set(key, action),
    [set, key]
  );
  return [value, setValue];
};

export const useAddonStateSnapshot = (): Partial<AddonStateMap> => {
  const store = useContext(AddonStateStoreContext);
  const subscribe = useCallback(
    (notify: () => void) => store.subscribe(undefined, notify),
    [store]
  );
  return useSyncExternalStore(
    subscribe,
    store.getSnapshot,
    store.getSnapshot
  ) as Partial<AddonStateMap>;
};

export const useRouteAddons = (): readonly AddonEntry[] | undefined =>
  useContext(AddonListContext) as readonly AddonEntry[] | undefined;

/** the host's name for the current route, when it passed one to the provider */
export const useAddonScope = (): string | undefined =>
  useContext(AddonScopeContext);
