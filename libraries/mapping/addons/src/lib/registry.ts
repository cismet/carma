import type { ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import type maplibregl from "maplibre-gl";
import type { Store } from "redux";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import type { carma } from "@carma-api";
import type {
  GazDataAdditionalModeConfig,
  GazDataSourceConfig,
} from "@carma-mapping/fuzzy-search";
import type { LayerStackEntry } from "@carma-mapping/layers";

import { GazetteerModeAddon } from "./GazetteerModeAddon";
import { GazetteerSourceAddon } from "./GazetteerSourceAddon";
import {
  VectorHighlightAddon,
  type VectorHighlightConfig,
} from "./VectorHighlightAddon";
import {
  LayerVisibilityAddon,
  layerVisibilityLayerButton,
  type LayerVisibilityConfig,
} from "./LayerVisibilityAddon";

export type AddonConfigMap = {
  gazetteerSource: GazDataSourceConfig;
  gazetteerMode: GazDataAdditionalModeConfig;
  vectorHighlight: VectorHighlightConfig;
  layerVisibility: LayerVisibilityConfig;
};

export type AddonKind = keyof AddonConfigMap;

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

/**
 * Opt in to a trigger button in the layer button. Declaring this also decides
 * where the addon is mounted: entries with a `layerButton` are rendered into
 * the interaction view while their button is active, entries without one are
 * mounted by `AddonHost` and render wherever they like, including `<Control>`.
 */
export type AddonLayerButton<K extends AddonKind = AddonKind> = {
  icon: IconDefinition;
  label: (ctx: AddonContext<K>) => string;
  badge?: (ctx: AddonContext<K>) => number;
  isApplicable?: (ctx: AddonContext<K>) => boolean;
};

export type AddonRegistryEntry<K extends AddonKind = AddonKind> = {
  Component: ComponentType<AddonComponentProps<K>>;
  layerButton?: AddonLayerButton<K>;
};

/** kind -> entry lookup used by the hosts */
export const addonRegistry: {
  [K in AddonKind]: AddonRegistryEntry<K>;
} = {
  gazetteerSource: { Component: GazetteerSourceAddon },
  gazetteerMode: { Component: GazetteerModeAddon },
  vectorHighlight: { Component: VectorHighlightAddon },
  layerVisibility: {
    Component: LayerVisibilityAddon,
    layerButton: layerVisibilityLayerButton,
  },
};

const isKnownKind = (kind: string): kind is AddonKind =>
  Object.prototype.hasOwnProperty.call(addonRegistry, kind);

/**
 * Resolve an entry's trigger button against its target, or `undefined` when
 * the kind has no button or is not applicable to this target. Keeps the
 * per-kind generics contained; callers see plain values.
 */
export const resolveAddonLayerButton = (
  addon: ResolvedAddon,
  target: LayerStackEntry | null
): { icon: IconDefinition; label: string; badge: number } | undefined => {
  const layerButton = addonRegistry[addon.kind].layerButton as
    | AddonLayerButton<AddonKind>
    | undefined;
  if (!layerButton) {
    return undefined;
  }
  const ctx: AddonContext<AddonKind> = { config: addon.config, target };
  if (layerButton.isApplicable?.(ctx) === false) {
    return undefined;
  }
  return {
    icon: layerButton.icon,
    label: layerButton.label(ctx),
    badge: layerButton.badge?.(ctx) ?? 0,
  };
};

/** Drop entries whose kind is not registered, so unknown kinds are inert. */
export const resolveAddonEntries = (
  entries?: readonly AddonEntry[]
): ResolvedAddon[] =>
  normalizeAddonEntries(entries).filter((entry) => isKnownKind(entry.kind));
