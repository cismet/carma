import { faHospital } from "@fortawesome/free-solid-svg-icons";

import type { AddonComponentProps } from "../../../lib/registry";
import {
  useNearestFeatureCategory,
  type NearestFeatureCategory,
  type NearestFeatureCategoryConfig,
} from "../categoryChannel";

/**
 * "Krankenhäuser" as a category of the "In der Nähe" mode. Headless, like every
 * category: see `Apotheken.tsx` for what that means.
 *
 * A POI layer, so it names its own feature index for the reason `Bahnhoefe.tsx`
 * spells out: one tileset holds every kind of place, and the index that belongs
 * to this layer is the per-kind file next to the tiles.
 */

const KRANKENHAEUSER: NearestFeatureCategory = {
  key: "krankenhaeuser",
  label: "Krankenhäuser",
  icon: faHospital,
  layerId: "wuppPOI:poi_krankenhaeuser",
  featureIndexUrl: "https://tiles.cismet.de/poi/krankenhauser.features.json",
  labelProperties: ["geographicidentifier", "name", "NAME", "bezeichnung"],
  detailProperties: ["strasse", "Strasse", "adresse", "Adresse", "info"],
};

/** everything but the key, so a route may point it at another layer or rename it */
export type NearestFeatureKrankenhaeuserConfig = NearestFeatureCategoryConfig;

export const NearestFeatureKrankenhaeuser = ({
  config,
}: AddonComponentProps<"nearestFeatureKrankenhaeuser">) => {
  useNearestFeatureCategory({ ...KRANKENHAEUSER, ...config });
  return null;
};
