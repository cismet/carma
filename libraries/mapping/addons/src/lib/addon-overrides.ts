import {
  addonRegistry,
  type AddonKind,
  type BareAddonKind,
  type ResolvedAddon,
} from "./registry";

/**
 * What the `addonManager` may change about the route's addon list at runtime,
 * and what `AddonHost` applies before mounting. Only the on/off decision, never
 * a config: a suspended addon that is switched back on is mounted from its
 * route entry again, with the config the route declares. The state lives in the
 * addon state map, which `AddonProvider` resets on route switch, and survives a
 * reload through `addon-overrides-storage`.
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
export const UNSUSPENDABLE_KIND = "addonManager" satisfies AddonKind;

/**
 * Kinds the manager may switch on in a route that did not declare them. The
 * `satisfies` is the whole point: only a kind whose config is entirely optional
 * can be mounted with no config at all, which is exactly `BareAddonKind`, so
 * naming a kind here that needs a config is a compile error rather than an
 * addon that mounts without its inputs.
 */
export const SWITCHABLE_KINDS = [
  "cameraRestriction",
  "nearestFeature",
  "nearestFeatureApotheken",
  "nearestFeatureBahnhoefe",
  "nearestFeatureKrankenhaeuser",
  "originSearch",
  "vectorHighlight",
  "vectorHighlightControl",
  "vectorHighlightDebug",
  "libreTerrain",
  "shadowSimulation",
  "visibleFeatureStatsSource",
  "visibleFeatureStatsPanel",
  "timeSlider",
  "cageIndicatorBadge",
] as const satisfies readonly BareAddonKind[];

export const isSwitchableKind = (kind: AddonKind): boolean =>
  (SWITCHABLE_KINDS as readonly AddonKind[]).includes(kind);

/**
 * Whether `AddonHost` is the one mounting this kind. Kinds with a trigger are
 * declared on a layer stack entry and mounted per layer by `TargetAddonHost`,
 * so the route-wide switch has nothing to act on. Decided by the trigger alone,
 * not by whether the kind has a `Component`: a caged kind resolves to no
 * component in a build without the cage submodule, and it is still a route-wide
 * addon there, just one that renders nothing.
 */
export const isHostMountedKind = (kind: AddonKind): boolean =>
  !addonRegistry[kind].trigger;

/**
 * Whether this build actually carries the kind's implementation. False only for
 * caged kinds in a checkout without cage; the switch still works, there is just
 * nothing behind it, so the manager says so rather than pretending the kind is
 * something else.
 */
export const isImplementedKind = (kind: AddonKind): boolean => {
  const entry = addonRegistry[kind];
  return !!entry.trigger || !!entry.Component;
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
