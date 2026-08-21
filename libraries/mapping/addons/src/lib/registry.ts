import type { ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import type maplibregl from "maplibre-gl";
import type { Store } from "redux";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { carma } from "@carma-api";
import type {
  GazDataAdditionalModeConfig,
  GazDataSourceConfig,
} from "@carma-mapping/fuzzy-search";
import type { LayerStackEntry } from "@carma-mapping/layers";

import { AddonManager, type AddonManagerConfig } from "../addons/AddonManager";
import type { AddonOverridesState } from "./addon-overrides";
import {
  CameraRestriction,
  type CameraRestrictionConfig,
} from "../addons/CameraRestriction";
import { GazetteerMode } from "../addons/GazetteerMode";
import { GazetteerSource } from "../addons/GazetteerSource";
import {
  HomeOverride,
  type HomeOverrideConfig,
} from "../addons/HomeOverride";
import {
  InfoBoxZoomImage,
  type InfoBoxImageState,
  type InfoBoxZoomImageConfig,
} from "../addons/InfoBoxZoomImage";
import { OutletAddon, type OutletConfig } from "../addons/outlet/Outlet";
import {
  VectorHighlight,
  VectorHighlightControl,
  type HighlightModeState,
  type VectorHighlightConfig,
  type VectorHighlightControlConfig,
} from "../addons/VectorHighlight";
import {
  LayerVisibility,
  layerVisibilityTrigger,
  type LayerVisibilityConfig,
} from "../addons/LayerVisibility";
import {
  VisibleFeatureStatsPanel,
  type VisibleFeatureStatsPanelConfig,
} from "../addons/VisibleFeatureStatsPanel";
import {
  VisibleFeatureStatsSource,
  type VisibleFeatureStatsSourceConfig,
  type VisibleFeatureStatsState,
} from "../addons/VisibleFeatureStatsSource";
import {
  zoomToExtentTrigger,
  type ZoomToExtentConfig,
} from "../addons/ZoomToExtent";
import {
  CageIndicatorBadge,
  type CageIndicatorBadgeConfig,
} from "./caged-addons";

export type AddonConfigMap = {
  addonManager: AddonManagerConfig;
  cameraRestriction: CameraRestrictionConfig;
  gazetteerSource: GazDataSourceConfig;
  gazetteerMode: GazDataAdditionalModeConfig;
  homeOverride: HomeOverrideConfig;
  vectorHighlight: VectorHighlightConfig;
  vectorHighlightControl: VectorHighlightControlConfig;
  layerVisibility: LayerVisibilityConfig;
  infoBoxZoomImage: InfoBoxZoomImageConfig;
  outlet: OutletConfig;
  visibleFeatureStatsSource: VisibleFeatureStatsSourceConfig;
  visibleFeatureStatsPanel: VisibleFeatureStatsPanelConfig;
  zoomToExtent: ZoomToExtentConfig;
  /** implemented in cage; renders nothing when cage is absent */
  cageIndicatorBadge: CageIndicatorBadgeConfig;
};

export type AddonKind = keyof AddonConfigMap;

/**
 * The channels addons share within one route. A channel is not a kind: several
 * kinds may read one channel, and the name says what the value *is*, not who
 * produces it.
 */
export type AddonStateMap = {
  /** what is on screen, grouped and counted; see `VisibleFeatureStatsSource` */
  visibleFeatureStats: VisibleFeatureStatsState;
  /** whether the highlighting mode is running; see `VectorHighlight` */
  highlightMode: HighlightModeState;
  /**
   * image the info box shows instead of the feature photo at the current zoom;
   * see `InfoBoxZoomImage`. Consumed by the host app's info box, not by an addon.
   */
  infoBoxImage: InfoBoxImageState;
  /**
   * which addons the user switched on or off; see `AddonManager`, which also
   * persists them per route. Read by `AddonHost` rather than by a sibling
   * addon, which is why it has no consumer among the registry's `requires`.
   */
  addonOverrides: AddonOverridesState;
};

export type AddonStateKey = keyof AddonStateMap;

/**
 * A full declaration: the kind plus its config. Kinds whose config is entirely
 * optional may be declared as `{ kind }` alone, so a route that just wants the
 * addon's defaults does not have to pass an empty config object.
 */
export type Addon = {
  // `Partial<C> extends C` holds exactly when every field of C is optional
  [K in AddonKind]: Partial<AddonConfigMap[K]> extends AddonConfigMap[K]
    ? { kind: K; config?: AddonConfigMap[K] }
    : { kind: K; config: AddonConfigMap[K] };
}[AddonKind];

/**
 * Kinds that may be declared as a bare string. Same condition as the optional
 * `config` in `Addon`: a kind whose config is required still has to be written
 * as `{ kind, config }`, so the shorthand can never drop a needed config.
 */
export type BareAddonKind = {
  [K in AddonKind]: Partial<AddonConfigMap[K]> extends AddonConfigMap[K]
    ? K
    : never;
}[AddonKind];

/**
 * How an addon is declared: the bare kind (`"cameraRestriction"`) for the
 * addon's own defaults, or the `{ kind, config }` form.
 */
export type AddonEntry = BareAddonKind | Addon;

export type ResolvedAddon = {
  [K in AddonKind]: { kind: K; config?: AddonConfigMap[K] };
}[AddonKind];

/** the kind of an entry, whichever of the two forms it was written in */
export const getAddonKind = (entry: AddonEntry): AddonKind =>
  typeof entry === "string" ? entry : entry.kind;

export const normalizeAddonEntries = (
  entries?: readonly AddonEntry[]
): ResolvedAddon[] =>
  (entries ?? []).map((entry) =>
    typeof entry === "string" ? ({ kind: entry } as ResolvedAddon) : entry
  );

export type AddonComponentProps<K extends AddonKind = AddonKind> = {
  config?: AddonConfigMap[K];
  carma: typeof carma;
  leafletMap: LeafletMap | null;
  libreMap: maplibregl.Map | null;
  /** the host app's redux store, taken from the surrounding react-redux provider */
  store: Store;
  target: LayerStackEntry | null;
};

export type AddonContext<K extends AddonKind = AddonKind> = {
  config?: AddonConfigMap[K];
  target: LayerStackEntry | null;
};

/** What a trigger's `onClick` gets, so an action can reach the app. */
export type AddonActionContext<K extends AddonKind = AddonKind> =
  AddonContext<K> & { carma: typeof carma };

/**
 * Opt in to a trigger inside the target's layer button: an icon the layer
 * button renders next to its title. Declaring this also decides where the
 * addon is mounted: entries with a `trigger` are rendered into the interaction
 * view while their trigger is active, entries without one are mounted by
 * `AddonHost` and render wherever they like, including `<Control>`.
 */
export type AddonTrigger<K extends AddonKind = AddonKind> = {
  icon: IconDefinition;
  label: (ctx: AddonContext<K>) => string;
  badge?: (ctx: AddonContext<K>) => number;
  isApplicable?: (ctx: AddonContext<K>) => boolean;
  onClick?: (ctx: AddonActionContext<K>) => void;
};

export type AddonRegistryEntry<K extends AddonKind = AddonKind> = {
  Component?: ComponentType<AddonComponentProps<K>>;
  trigger?: AddonTrigger<K>;
  /** state channels this addon writes (headless producers declare these) */
  provides?: readonly AddonStateKey[];
  /**
   * state channels this addon reads. `AddonProvider` warns in dev when a
   * route configures a consumer without any producer covering its channel,
   * so the mistake surfaces instead of an empty panel.
   */
  requires?: readonly AddonStateKey[];
};

/** kind -> entry lookup used by the hosts */
export const addonRegistry: {
  [K in AddonKind]: AddonRegistryEntry<K>;
} = {
  addonManager: { Component: AddonManager, provides: ["addonOverrides"] },
  cameraRestriction: { Component: CameraRestriction },
  gazetteerSource: { Component: GazetteerSource },
  outlet: { Component: OutletAddon },
  gazetteerMode: { Component: GazetteerMode },
  homeOverride: { Component: HomeOverride },
  vectorHighlight: {
    Component: VectorHighlight,
    provides: ["highlightMode"],
  },
  vectorHighlightControl: {
    Component: VectorHighlightControl,
    requires: ["highlightMode"],
  },
  layerVisibility: {
    Component: LayerVisibility,
    trigger: layerVisibilityTrigger,
  },
  infoBoxZoomImage: {
    Component: InfoBoxZoomImage,
    provides: ["infoBoxImage"],
  },
  visibleFeatureStatsSource: {
    Component: VisibleFeatureStatsSource,
    provides: ["visibleFeatureStats"],
  },
  visibleFeatureStatsPanel: {
    Component: VisibleFeatureStatsPanel,
    requires: ["visibleFeatureStats"],
  },
  zoomToExtent: { trigger: zoomToExtentTrigger },
  // Component is undefined when cage is absent; AddonHost renders nothing then.
  cageIndicatorBadge: { Component: CageIndicatorBadge },
};

const isKnownKind = (kind: string): kind is AddonKind =>
  Object.prototype.hasOwnProperty.call(addonRegistry, kind);

/**
 * Resolve an entry's trigger against its target, or `undefined` when the kind
 * has no trigger or is not applicable to this target. Keeps the per-kind
 * generics contained; callers see plain values.
 */
export const resolveAddonTrigger = (
  addon: ResolvedAddon,
  target: LayerStackEntry | null
):
  | {
      icon: IconDefinition;
      label: string;
      badge: number;
      onClick?: () => void;
    }
  | undefined => {
  const trigger = addonRegistry[addon.kind].trigger as
    | AddonTrigger<AddonKind>
    | undefined;
  if (!trigger) {
    return undefined;
  }
  const ctx: AddonContext<AddonKind> = { config: addon.config, target };
  if (trigger.isApplicable?.(ctx) === false) {
    return undefined;
  }
  const { onClick } = trigger;
  return {
    icon: trigger.icon,
    label: trigger.label(ctx),
    badge: trigger.badge?.(ctx) ?? 0,
    ...(onClick ? { onClick: () => onClick({ ...ctx, carma }) } : {}),
  };
};

/** Drop entries whose kind is not registered, so unknown kinds are inert. */
export const resolveAddonEntries = (
  entries?: readonly AddonEntry[]
): ResolvedAddon[] =>
  normalizeAddonEntries(entries).filter((entry) => isKnownKind(entry.kind));
