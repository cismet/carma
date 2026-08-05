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

import { GazetteerMode } from "../addons/GazetteerMode";
import { GazetteerSource } from "../addons/GazetteerSource";
import { OutletAddon, type OutletConfig } from "../addons/outlet/Outlet";
import {
  VectorHighlight,
  type HighlightModeState,
  type VectorHighlightConfig,
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

export type AddonConfigMap = {
  gazetteerSource: GazDataSourceConfig;
  gazetteerMode: GazDataAdditionalModeConfig;
  vectorHighlight: VectorHighlightConfig;
  layerVisibility: LayerVisibilityConfig;
  outlet: OutletConfig;
  visibleFeatureStatsSource: VisibleFeatureStatsSourceConfig;
  visibleFeatureStatsPanel: VisibleFeatureStatsPanelConfig;
  zoomToExtent: ZoomToExtentConfig;
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
};

export type AddonStateKey = keyof AddonStateMap;

/** A full declaration: the kind plus its config. */
export type Addon = {
  [K in AddonKind]: { kind: K; config: AddonConfigMap[K] };
}[AddonKind];

export type AddonEntry = AddonKind | Addon;

export type ResolvedAddon = {
  [K in AddonKind]: { kind: K; config?: AddonConfigMap[K] };
}[AddonKind];

export const normalizeAddonEntries = (
  entries?: readonly AddonEntry[]
): ResolvedAddon[] =>
  (entries ?? []).map((entry) =>
    typeof entry === "string" ? { kind: entry } : entry
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
  gazetteerSource: { Component: GazetteerSource },
  outlet: { Component: OutletAddon },
  gazetteerMode: { Component: GazetteerMode },
  vectorHighlight: {
    Component: VectorHighlight,
    provides: ["highlightMode"],
  },
  layerVisibility: {
    Component: LayerVisibility,
    trigger: layerVisibilityTrigger,
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
