import { normalizeAddonEntries, type AddonEntry } from "./registry";

/**
 * The scope one stored addon channel lives in: the kinds the route declares,
 * sorted, so two routes with different addon lists do not share a state.
 *
 * Deriving the scope from the list rather than from a route id keeps this
 * library free of the host's routing, and lets a changed route list start from
 * its own defaults instead of inheriting decisions that were made about a
 * different set of addons.
 */
export const routeStorageKey = (
  prefix: string,
  addons?: readonly AddonEntry[]
): string => {
  const kinds = [
    ...new Set(normalizeAddonEntries(addons).map(({ kind }) => kind)),
  ].sort();
  return `${prefix}${kinds.join(",")}`;
};
