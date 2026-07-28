import type { ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import type maplibregl from "maplibre-gl";
import type { Store } from "redux";

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

export type AddonConfigMap = {
  gazetteerSource: GazDataSourceConfig;
  gazetteerMode: GazDataAdditionalModeConfig;
  vectorHighlight: VectorHighlightConfig;
};

export type AddonKind = keyof AddonConfigMap;

export type Addon = {
  [K in AddonKind]: { kind: K; config: AddonConfigMap[K] };
}[AddonKind];

export type AddonComponentProps<K extends AddonKind = AddonKind> = {
  config: AddonConfigMap[K];
  carma: typeof carma;
  leafletMap: LeafletMap | null;
  libreMap: maplibregl.Map | null;
  /** the host app's redux store, taken from the surrounding react-redux provider */
  store: Store;
  target: LayerStackEntry | null;
};

export type AddonRegistryEntry<K extends AddonKind = AddonKind> = {
  Component: ComponentType<AddonComponentProps<K>>;
};

/** kind -> entry lookup used by `AddonHost` */
export const addonRegistry: {
  [K in AddonKind]: AddonRegistryEntry<K>;
} = {
  gazetteerSource: { Component: GazetteerSourceAddon },
  gazetteerMode: { Component: GazetteerModeAddon },
  vectorHighlight: { Component: VectorHighlightAddon },
};
