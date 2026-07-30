import { useCallback, useContext } from "react";

import {
  AddonListContext,
  AddonStateSetterContext,
  AddonStateValueContext,
} from "@carma-mapping/contexts";

import type { AddonEntry, AddonStateKey, AddonStateMap } from "./registry";

export type AddonStateAction<K extends AddonStateKey> =
  | AddonStateMap[K]
  | ((previous: AddonStateMap[K] | undefined) => AddonStateMap[K]);

export const useAddonState = <K extends AddonStateKey>(
  key: K
): [AddonStateMap[K] | undefined, (action: AddonStateAction<K>) => void] => {
  const state = useContext(AddonStateValueContext) as Partial<AddonStateMap>;
  const set = useContext(AddonStateSetterContext);
  const setValue = useCallback(
    (action: AddonStateAction<K>) => set(key, action),
    [set, key]
  );
  return [state[key], setValue];
};

export const useAddonStateSnapshot = (): Partial<AddonStateMap> =>
  useContext(AddonStateValueContext) as Partial<AddonStateMap>;

export const useRouteAddons = (): readonly AddonEntry[] | undefined =>
  useContext(AddonListContext) as readonly AddonEntry[] | undefined;
