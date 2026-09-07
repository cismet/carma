import { createContext, useRef, useState, type ReactNode } from "react";
import {
  createAddonStateStore,
  type AddonStateRecord,
  type AddonStateSet,
} from "./addon-state-store";
export type { AddonStateRecord, AddonStateSet } from "./addon-state-store";

/**
 * Generic, string-keyed core of the state map addons share within one route:
 * headless addons write channels, UI addons read them. The typed surface (the
 * channel map, `useAddonState`) lives in `@carma-mapping/addons`; the core
 * lives here so `CarmaMapProviderWrapper` can mount the provider without a
 * dependency on the addons library, which would be circular
 * (portals -> addons -> fuzzy-search -> portals).
 */

export const EMPTY_ADDON_STATE: AddonStateRecord = {};

const noProviderSet: AddonStateSet = () => {
  if (import.meta.env.DEV) {
    console.warn(
      "[ADDON STATE] set called without an AddonProvider above; the value is dropped"
    );
  }
};

const emptyStore = createAddonStateStore(EMPTY_ADDON_STATE);
export const AddonStateStoreContext = createContext(emptyStore);
export const AddonStateSetterContext =
  createContext<AddonStateSet>(noProviderSet);

export const AddonListContext = createContext<readonly unknown[] | undefined>(
  undefined
);

/**
 * The host's name for the current addon scope, usually its route path. Addons
 * that persist something per route key their storage on it; undefined when the
 * host passed none, in which case they fall back to the location.
 */
export const AddonScopeContext = createContext<string | undefined>(undefined);

export const AddonProvider = ({
  addons,
  scopeKey,
  initialState = EMPTY_ADDON_STATE,
  children,
}: {
  addons?: readonly unknown[];
  /** route identity: resets the state map when it changes and scopes per-route storage */
  scopeKey?: string;
  /** Already resolved launch state, consumed once per route before children mount. */
  initialState?: AddonStateRecord;
  children: ReactNode;
}) => {
  const scope: unknown = scopeKey !== undefined ? scopeKey : addons;
  const [store, setStore] = useState(() => createAddonStateStore(initialState));

  const scopeRef = useRef(scope);
  if (!Object.is(scopeRef.current, scope)) {
    scopeRef.current = scope;
    setStore(createAddonStateStore(initialState));
  }

  return (
    <AddonListContext.Provider value={addons}>
      <AddonScopeContext.Provider value={scopeKey}>
        <AddonStateSetterContext.Provider value={store.set}>
          <AddonStateStoreContext.Provider value={store}>
            {children}
          </AddonStateStoreContext.Provider>
        </AddonStateSetterContext.Provider>
      </AddonScopeContext.Provider>
    </AddonListContext.Provider>
  );
};
