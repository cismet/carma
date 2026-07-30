import { createContext, useCallback, useContext } from "react";

import type { AddonStateKey, AddonStateMap } from "./registry";

export type AddonStateAction<K extends AddonStateKey> =
  | AddonStateMap[K]
  | ((previous: AddonStateMap[K] | undefined) => AddonStateMap[K]);

export type AddonStateSet = <K extends AddonStateKey>(
  key: K,
  action: AddonStateAction<K>
) => void;

export const EMPTY_ADDON_STATE: Partial<AddonStateMap> = {};

const noProviderSet: AddonStateSet = () => {
  if (import.meta.env.DEV) {
    console.warn(
      "[ADDON STATE] set called without an AddonProvider above; the value is dropped"
    );
  }
};

export const AddonStateValueContext =
  createContext<Partial<AddonStateMap>>(EMPTY_ADDON_STATE);
export const AddonStateSetterContext =
  createContext<AddonStateSet>(noProviderSet);

export const useAddonState = <K extends AddonStateKey>(
  key: K
): [AddonStateMap[K] | undefined, (action: AddonStateAction<K>) => void] => {
  const state = useContext(AddonStateValueContext);
  const set = useContext(AddonStateSetterContext);
  const setValue = useCallback(
    (action: AddonStateAction<K>) => set(key, action),
    [set, key]
  );
  return [state[key], setValue];
};

export const useAddonStateSnapshot = (): Partial<AddonStateMap> =>
  useContext(AddonStateValueContext);
