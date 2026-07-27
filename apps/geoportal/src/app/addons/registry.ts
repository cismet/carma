import type { ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";

import type { carma } from "@carma-api";
import type {
  GazDataAdditionalModeConfig,
  GazDataSourceConfig,
} from "@carma-mapping/fuzzy-search";

import type { AppStore } from "../store";

import { GazetteerModeAddon } from "./GazetteerModeAddon";
import { GazetteerSourceAddon } from "./GazetteerSourceAddon";

export type AddonConfigMap = {
  gazetteerSource: GazDataSourceConfig;
  gazetteerMode: GazDataAdditionalModeConfig;
};

export type AddonKind = keyof AddonConfigMap;

export type FachzwillingAddon = {
  [K in AddonKind]: { kind: K; config: AddonConfigMap[K] };
}[AddonKind];

export type AddonComponentProps<K extends AddonKind = AddonKind> = {
  config: AddonConfigMap[K];
  carma: typeof carma;
  leafletMap: LeafletMap | null;
  store: AppStore;
};

/** kind -> component lookup used by `FachzwillingAddonHost` */
export const addonRegistry: {
  [K in AddonKind]: ComponentType<AddonComponentProps<K>>;
} = {
  gazetteerSource: GazetteerSourceAddon,
  gazetteerMode: GazetteerModeAddon,
};
