import type { ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Store } from "redux";

import type { carma } from "@carma-api";
import type {
  GazDataAdditionalModeConfig,
  GazDataSourceConfig,
} from "@carma-mapping/fuzzy-search";

import { GazetteerModeAddon } from "./GazetteerModeAddon";
import { GazetteerSourceAddon } from "./GazetteerSourceAddon";

export type AddonConfigMap = {
  gazetteerSource: GazDataSourceConfig;
  gazetteerMode: GazDataAdditionalModeConfig;
};

export type AddonKind = keyof AddonConfigMap;

export type Addon = {
  [K in AddonKind]: { kind: K; config: AddonConfigMap[K] };
}[AddonKind];

export type AddonComponentProps<K extends AddonKind = AddonKind> = {
  config: AddonConfigMap[K];
  carma: typeof carma;
  leafletMap: LeafletMap | null;
  /** the host app's redux store, taken from the surrounding react-redux provider */
  store: Store;
};

/** kind -> component lookup used by `AddonHost` */
export const addonRegistry: {
  [K in AddonKind]: ComponentType<AddonComponentProps<K>>;
} = {
  gazetteerSource: GazetteerSourceAddon,
  gazetteerMode: GazetteerModeAddon,
};
