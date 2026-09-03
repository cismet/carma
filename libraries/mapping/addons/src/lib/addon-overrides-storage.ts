import { useCallback, useMemo } from "react";

import {
  EMPTY_ADDON_OVERRIDES,
  isSwitchableKind,
  UNSUSPENDABLE_KIND,
  type AddonOverridesState,
} from "./addon-overrides";
import {
  useAddonScope,
  useAddonState,
  useRouteAddons,
} from "./AddonStateContext";
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
 * config the route declares. One entry per route, keyed on the scope the host
 * passes to `AddonProvider` (the geoportal passes the route path) or, without
 * one, on the route path read off the location; `addonManager`'s `storageKey`
 * replaces that key for a route that wants to share or pin its entry.
 *
 * The stored state is only ever read on a route that declares the manager. A
 * route without one has nothing that could switch its addons, so it mounts its
 * declared list and nothing else, whatever another route's manager stored in
 * the meantime.
 */

/**
 * Prefix of every per-route entry, and by itself the key of the shared entry
 * older builds wrote for all routes at once. The stored state names kinds, not
 * positions in a list, so it stays meaningful when a route's declared addons
 * change: a kind that was switched off stays off, and a newly declared kind is
 * in neither list and therefore mounts. Deriving the key from the declared
 * kinds instead would orphan the whole state on every config edit, which reads
 * as "the manager forgot everything" rather than as a fresh scope.
 */
export const ADDON_OVERRIDES_STORAGE_KEY = "carma::addonOverrides";

/**
 * The route path as the location shows it, for a host that passes no scope:
 * the pathname, plus the hash's path part for a hash router, so `/#/addons?x=1`
 * and `/addons` both come out as `/addons`.
 */
const routeScopeFromLocation = (): string => {
  if (typeof window === "undefined") {
    return "/";
  }
  const { pathname, hash } = window.location;
  const hashPath = hash.startsWith("#/") ? hash.slice(1).split("?")[0] : "";
  return `${pathname}${hashPath}`.replace(/\/+$/, "") || "/";
};

/**
 * The key this route stores under: the one the `addonManager` entry names, and
 * otherwise the shared prefix with the route's scope behind it; no key at all
 * when the route does not declare the manager. The scope comes from the host
 * through the provider rather than from a router of this library's own, and
 * the entry's `storageKey` puts the remaining decision where the rest of the
 * manager's setup already lives.
 */
export const addonOverridesStorageKey = (
  addons?: readonly AddonEntry[],
  scope: string = routeScopeFromLocation()
): string | undefined => {
  const manager = normalizeAddonEntries(addons).find(
    ({ kind }) => kind === UNSUSPENDABLE_KIND
  );
  if (manager?.kind !== UNSUSPENDABLE_KIND) {
    return undefined;
  }
  return (
    manager.config?.storageKey || `${ADDON_OVERRIDES_STORAGE_KEY}::${scope}`
  );
};

/**
 * Older builds wrote one entry for every route, and every route applied it,
 * which is how an addon switched on in one route showed up in all of them.
 * Only a route with a manager could have written it, so the first such route
 * to load takes the entry over as its own, and the shared one goes away either
 * way: a browser that still carries it heals on the next refresh instead of
 * keeping the spilled state around, and the switches set on the manager's
 * route are not lost to the key change. A route that already has its own
 * entry keeps it; the legacy one is older by definition.
 */
const migrateLegacySharedOverrides = (storageKey: string | undefined) => {
  try {
    const storage = window.localStorage;
    const legacy = storage.getItem(ADDON_OVERRIDES_STORAGE_KEY);
    if (legacy === null) {
      return;
    }
    if (
      storageKey &&
      storageKey !== ADDON_OVERRIDES_STORAGE_KEY &&
      storage.getItem(storageKey) === null
    ) {
      storage.setItem(storageKey, legacy);
    }
    storage.removeItem(ADDON_OVERRIDES_STORAGE_KEY);
  } catch {
    // storage unavailable: nothing was read from it either
  }
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

/** undefined without a key: a route without a manager reads no stored state */
export const loadAddonOverrides = (
  storageKey: string | undefined
): AddonOverridesState | undefined => {
  if (!storageKey) {
    return undefined;
  }
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
  overrides: AddonOverridesState,
  storageKey: string | undefined
) => {
  if (!storageKey) {
    return;
  }
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
  const scope = useAddonScope();
  const [sessionOverrides, setOverrides] = useAddonState("addonOverrides");

  const storageKey = useMemo(
    () => addonOverridesStorageKey(addons, scope),
    [addons, scope]
  );
  const storedOverrides = useMemo(() => {
    migrateLegacySharedOverrides(storageKey);
    return loadAddonOverrides(storageKey);
  }, [storageKey]);

  const update = useCallback(
    (updater: AddonOverridesUpdate) =>
      setOverrides((previous) => {
        const next = updater(
          previous ?? loadAddonOverrides(storageKey) ?? EMPTY_ADDON_OVERRIDES
        );
        saveAddonOverrides(next, storageKey);
        return next;
      }),
    [setOverrides, storageKey]
  );

  return [sessionOverrides ?? storedOverrides, update];
};
