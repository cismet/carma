import {
  useFeatureItems,
  type FeatureItem,
  type FeatureItemsConfig,
  type FeatureItemsContextValue,
} from "@carma-appframeworks/portals";

import {
  VORHABEN_GEOMS_LAYER,
  type VorhabenFeatureProperties,
} from "./vorhabenGeoJson";
import {
  buildVorhabenFilterExpression,
  matchesVorhabenFilter,
  type VorhabenFilterState,
} from "./vorhabenFilter";

export interface VorhabenTopic {
  name: string;
  farbe: string;
}

export interface VorhabenDictionary {
  /** Themes in order of first appearance, like createItemsDictionary did */
  topics: VorhabenTopic[];
}

export type VorhabenItem = FeatureItem<VorhabenFeatureProperties>;

export type VorhabenItemsContext = FeatureItemsContextValue<
  VorhabenFeatureProperties,
  VorhabenFilterState,
  VorhabenDictionary
>;

export const useVorhabenItems = (): VorhabenItemsContext =>
  useFeatureItems<
    VorhabenFeatureProperties,
    VorhabenFilterState,
    VorhabenDictionary
  >();

const deriveDictionary = (items: VorhabenItem[]): VorhabenDictionary => {
  const seen = new Set<string>();
  const topics: VorhabenTopic[] = [];
  for (const { properties } of items) {
    if (!seen.has(properties.thema_name)) {
      seen.add(properties.thema_name);
      topics.push({ name: properties.thema_name, farbe: properties.thema_farbe });
    }
  }
  return { topics };
};

/** Module constant: FeatureItemsProvider memoizes its derived values on it */
export const vorhabenItemsConfig: FeatureItemsConfig<
  VorhabenFeatureProperties,
  VorhabenFilterState,
  VorhabenDictionary
> = {
  idProperty: "fid",
  primaryLayer: VORHABEN_GEOMS_LAYER,
  deriveDictionary,
  filter: {
    // every theme selected, as the old FeatureCollectionContextProvider did
    initial: (dictionary) => ({
      topics: dictionary.topics.map((topic) => topic.name),
      citizen: false,
    }),
    matches: matchesVorhabenFilter,
    toExpression: buildVorhabenFilterExpression,
  },
};
