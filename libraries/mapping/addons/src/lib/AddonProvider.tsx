import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  addonRegistry,
  resolveAddonEntries,
  type AddonEntry,
  type AddonStateMap,
} from "./registry";
import {
  AddonStateSetterContext,
  AddonStateValueContext,
  EMPTY_ADDON_STATE,
  type AddonStateSet,
} from "./AddonStateContext";

const warnOnUnmetRequirements = (addons?: readonly AddonEntry[]) => {
  const entries = resolveAddonEntries(addons);
  const provided = new Set<string>();
  for (const entry of entries) {
    for (const channel of addonRegistry[entry.kind].provides ?? []) {
      provided.add(channel);
    }
  }
  for (const entry of entries) {
    for (const channel of addonRegistry[entry.kind].requires ?? []) {
      if (!provided.has(channel)) {
        console.warn(
          `[ADDON STATE] addon "${entry.kind}" requires channel "${String(
            channel
          )}" but no configured addon provides it`,
          { configuredAddons: entries.map(({ kind }) => kind) }
        );
      }
    }
  }
};

export const AddonProvider = ({
  addons,
  scopeKey,
  children,
}: {
  addons?: readonly AddonEntry[];
  /** overrides the default scope (the `addons` identity) */
  scopeKey?: unknown;
  children: ReactNode;
}) => {
  const scope = scopeKey !== undefined ? scopeKey : addons;
  const [state, setState] = useState<Partial<AddonStateMap>>(EMPTY_ADDON_STATE);

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
          ? (
              action as (
                prev: typeof previousValue
              ) => AddonStateMap[typeof key]
            )(previousValue)
          : action;
      if (Object.is(previousValue, nextValue)) {
        return previous;
      }
      return { ...previous, [key]: nextValue };
    });
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      warnOnUnmetRequirements(addons);
    }
  }, [addons]);

  return (
    <AddonStateSetterContext.Provider value={set}>
      <AddonStateValueContext.Provider value={state}>
        {children}
      </AddonStateValueContext.Provider>
    </AddonStateSetterContext.Provider>
  );
};
