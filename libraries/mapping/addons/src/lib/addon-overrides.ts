import {
  addonRegistry,
  type AddonKind,
  type BareAddonKind,
  type ResolvedAddon,
} from "./registry";

/**
 * What the `addonManager` may change about the route's addon list at runtime,
 * and what `AddonHost` applies before mounting. Session-only by design: it
 * lives in the addon state map, which `AddonProvider` resets on route switch
 * and writes nowhere, so a reload is always back to what the route declares.
 */
export type AddonOverridesState = {
  /** declared kinds the user switched off */
  readonly suspended: readonly AddonKind[];
  /** undeclared kinds the user switched on, mounted with their defaults */
  readonly enabled: readonly AddonKind[];
};

export const EMPTY_ADDON_OVERRIDES: AddonOverridesState = {
  suspended: [],
  enabled: [],
};

/**
 * The kind that does the switching, and therefore the one kind that must not be
 * switched off: without it there is no way back.
 */
export const UNSUSPENDABLE_KIND: AddonKind = "addonManager";

/**
 * Kinds the manager may switch on in a route that did not declare them. The
 * `satisfies` is the whole point: only a kind whose config is entirely optional
 * can be mounted with no config at all, which is exactly `BareAddonKind`, so
 * naming a kind here that needs a config is a compile error rather than an
 * addon that mounts without its inputs.
 */
export const SWITCHABLE_KINDS = [
  "cameraRestriction",
  "vectorHighlight",
  "visibleFeatureStatsSource",
  "visibleFeatureStatsPanel",
] as const satisfies readonly BareAddonKind[];

export const isSwitchableKind = (kind: AddonKind): boolean =>
  (SWITCHABLE_KINDS as readonly AddonKind[]).includes(kind);

/**
 * Whether `AddonHost` is the one mounting this kind. Kinds with a trigger are
 * declared on a layer stack entry and mounted per layer by `TargetAddonHost`,
 * so the route-wide switch has nothing to act on.
 */
export const isHostMountedKind = (kind: AddonKind): boolean => {
  const entry = addonRegistry[kind];
  return !entry.trigger && !!entry.Component;
};

/** the route's entries as the host should mount them, overrides applied */
export const applyAddonOverrides = (
  entries: readonly ResolvedAddon[],
  overrides?: AddonOverridesState
): readonly ResolvedAddon[] => {
  if (!overrides) {
    return entries;
  }
  const { suspended, enabled } = overrides;

  const kept = entries.filter(
    ({ kind }) => kind === UNSUSPENDABLE_KIND || !suspended.includes(kind)
  );
  const declared = new Set(kept.map(({ kind }) => kind));
  const added = enabled
    .filter((kind) => !declared.has(kind) && isSwitchableKind(kind))
    .map((kind) => ({ kind } as ResolvedAddon));

  return added.length ? [...kept, ...added] : kept;
};
