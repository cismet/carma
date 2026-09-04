import { faTrain } from "@fortawesome/free-solid-svg-icons";

import type { AddonComponentProps } from "../../../lib/registry";
import {
  useNearestFeatureCategory,
  type NearestFeatureCategory,
  type NearestFeatureCategoryConfig,
} from "../categoryChannel";

/**
 * "Bahnhöfe" as a category of the "In der Nähe" mode. Headless, like every
 * category: see `Apotheken.tsx` for what that means.
 *
 * The one thing it does that the pharmacies do not is name its own feature
 * index. Its layer draws from the shared POI tileset, where every kind of place
 * is in one directory under the source-layer `poi` and the style layers differ
 * by a filter on `identificationids`; the index that directory publishes is
 * therefore every POI there is, and the one that belongs to this layer is the
 * per-kind file next to it.
 */

const BAHNHOEFE: NearestFeatureCategory = {
  key: "bahnhoefe",
  label: "Bahnhöfe",
  icon: faTrain,
  layerId: "wuppPOI:poi_bahnhoefe",
  featureIndexUrl: "https://tiles.cismet.de/poi/bahnhofe.features.json",
  // what the POI tiles call a place, ahead of the names other layers use, so a
  // route pointing this at another layer still gets a title
  labelProperties: ["geographicidentifier", "name", "NAME", "bezeichnung"],
  detailProperties: ["strasse", "Strasse", "adresse", "Adresse", "info"],
};

/** everything but the key, so a route may point it at another layer or rename it */
export type NearestFeatureBahnhoefeConfig = NearestFeatureCategoryConfig;

export const NearestFeatureBahnhoefe = ({
  config,
}: AddonComponentProps<"nearestFeatureBahnhoefe">) => {
  useNearestFeatureCategory({ ...BAHNHOEFE, ...config });
  return null;
};
