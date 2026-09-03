import {
  createContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Generic, string-keyed core of the state map addons share within one route:
 * headless addons write channels, UI addons read them. The typed surface (the
 * channel map, `useAddonState`) lives in `@carma-mapping/addons`; the core
 * lives here so `CarmaMapProviderWrapper` can mount the provider without a
 * dependency on the addons library, which would be circular
 * (portals -> addons -> fuzzy-search -> portals).
 */

export type AddonStateRecord = Record<string, unknown>;

export type AddonStateSet = (key: string, action: unknown) => void;

export const EMPTY_ADDON_STATE: AddonStateRecord = {};

const noProviderSet: AddonStateSet = () => {
  if (import.meta.env.DEV) {
    console.warn(
      "[ADDON STATE] set called without an AddonProvider above; the value is dropped"
    );
  }
};

export const AddonStateValueContext =
  createContext<AddonStateRecord>(EMPTY_ADDON_STATE);
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
  children,
}: {
  addons?: readonly unknown[];
  /** route identity: resets the state map when it changes and scopes per-route storage */
  scopeKey?: string;
  children: ReactNode;
}) => {
  const scope: unknown = scopeKey !== undefined ? scopeKey : addons;
  const [state, setState] = useState<AddonStateRecord>(EMPTY_ADDON_STATE);

  const scopeRef = useRef(scope);
  if (!Object.is(scopeRef.current, scope)) {
    scopeRef.current = scope;
    setState(EMPTY_ADDON_STATE);
  }

  const set = useCallback<AddonStateSet>((key, action) => {
    setState((previous) => {
      const previousValue = previous[key];
      const nextValue =
        typeof action === "function"
          ? (action as (prev: unknown) => unknown)(previousValue)
          : action;
      if (Object.is(previousValue, nextValue)) {
        return previous;
      }
      return { ...previous, [key]: nextValue };
    });
  }, []);

  return (
    <AddonListContext.Provider value={addons}>
      <AddonScopeContext.Provider value={scopeKey}>
        <AddonStateSetterContext.Provider value={set}>
          <AddonStateValueContext.Provider value={state}>
            {children}
          </AddonStateValueContext.Provider>
        </AddonStateSetterContext.Provider>
      </AddonScopeContext.Provider>
    </AddonListContext.Provider>
  );
};
