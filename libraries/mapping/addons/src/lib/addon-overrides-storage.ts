import { useCallback, useMemo } from "react";

import {
  EMPTY_ADDON_OVERRIDES,
  isSwitchableKind,
  UNSUSPENDABLE_KIND,
  type AddonOverridesState,
} from "./addon-overrides";
import { useAddonState, useRouteAddons } from "./AddonStateContext";
import {
  addonRegistry,
  normalizeAddonEntries,
  type AddonEntry,
  type AddonKind,
} from "./registry";

/**
 * Persistence for what the `addonManager` switched on or off. The addon state
 * map itself is session-only (the provider resets it on route switch and writes
 * nowhere), so the manager mirrors its own channel into `localStorage` and
 * seeds from there on the next load.
 *
 * Only the on/off decision is stored, never a config: a declared addon that is
 * switched back on is mounted from the route entry again, with exactly the
 * config the route declares.
 */

const STORAGE_PREFIX = "carma::addonOverrides::";

/**
 * Scope of one stored entry: the kinds the route declares, sorted, so two
 * routes with different addon lists do not share a state. Deriving the key from
 * the list rather than from a route id keeps this library free of the host's
 * routing, and lets a changed route list start from its own defaults instead of
 * inheriting decisions that were made about a different set of addons.
 */
export const addonOverridesStorageKey = (
  addons?: readonly AddonEntry[]
): string => {
  const kinds = [
    ...new Set(normalizeAddonEntries(addons).map(({ kind }) => kind)),
  ].sort();
  return `${STORAGE_PREFIX}${kinds.join(",")}`;
};

const isKnownKind = (value: unknown): value is AddonKind =>
  typeof value === "string" && value in addonRegistry;

/**
 * Read a stored kind list, dropping everything the current build cannot honour
 * anyway: kinds that no longer exist in the registry, and kinds the manager
 * itself would refuse to switch. A stored state older than the registry is
 * therefore partially applied rather than rejected as a whole.
 */
const readKinds = (
  value: unknown,
  keep: (kind: AddonKind) => boolean
): AddonKind[] =>
  Array.isArray(value)
    ? [...new Set(value.filter(isKnownKind).filter(keep))]
    : [];

export const loadAddonOverrides = (
  storageKey: string
): AddonOverridesState | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<AddonOverridesState> | null;
    return {
      suspended: readKinds(
        parsed?.suspended,
        (kind) => kind !== UNSUSPENDABLE_KIND
      ),
      // an undeclared kind can only be mounted without config, so only a
      // switchable kind survives; a declared one comes back via `suspended`
      enabled: readKinds(parsed?.enabled, isSwitchableKind),
    };
  } catch (error) {
    console.warn("[ADDON STATE] stored addon overrides are unusable", error);
    return undefined;
  }
};

export const saveAddonOverrides = (
  storageKey: string,
  overrides: AddonOverridesState
) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(overrides));
  } catch (error) {
    console.warn("[ADDON STATE] addon overrides could not be stored", error);
  }
};

export type AddonOverridesUpdate = (
  previous: AddonOverridesState
) => AddonOverridesState;

/**
 * The manager's channel with the stored state in front of it: the session value
 * wins once something was switched in this session, and until then the stored
 * one stands in. Reading the store synchronously instead of hydrating it in an
 * effect matters for `AddonHost`, which would otherwise mount the route's
 * addons for one render before dropping the suspended ones again.
 */
export const usePersistedAddonOverrides = (): [
  AddonOverridesState | undefined,
  (update: AddonOverridesUpdate) => void
] => {
  const addons = useRouteAddons();
  const [sessionOverrides, setOverrides] = useAddonState("addonOverrides");

  const storageKey = useMemo(() => addonOverridesStorageKey(addons), [addons]);
  const storedOverrides = useMemo(
    () => loadAddonOverrides(storageKey),
    [storageKey]
  );

  const update = useCallback(
    (updater: AddonOverridesUpdate) =>
      setOverrides((previous) => {
        const next = updater(
          previous ?? loadAddonOverrides(storageKey) ?? EMPTY_ADDON_OVERRIDES
        );
        saveAddonOverrides(storageKey, next);
        return next;
      }),
    [setOverrides, storageKey]
  );

  return [sessionOverrides ?? storedOverrides, update];
};
