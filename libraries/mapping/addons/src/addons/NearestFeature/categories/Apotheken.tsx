import { faPrescriptionBottleMedical } from "@fortawesome/free-solid-svg-icons";

import type { AddonComponentProps } from "../../../lib/registry";
import {
  useNearestFeatureCategory,
  type NearestFeatureCategory,
  type NearestFeatureCategoryConfig,
} from "../categoryChannel";

/**
 * "Apotheken" as a category of the "In der Nähe" mode.
 *
 * Headless: it publishes its name, its icon and its layer on the
 * `nearestFeatureCategories` channel and renders nothing. The mode picks it up
 * from there, so a route decides which categories it offers by declaring the
 * category addons it wants, and each of them can be switched off on its own.
 *
 * A further category is a copy of this file with another definition; nothing
 * else changes, and the mode is not touched.
 */

const APOTHEKEN: NearestFeatureCategory = {
  key: "apotheken",
  label: "Apotheken",
  icon: faPrescriptionBottleMedical,
  layerId: "wuppInfra:apotheken",
  labelProperties: ["name", "NAME", "bezeichnung", "Bezeichnung", "titel"],
  detailProperties: ["strasse", "Strasse", "adresse", "Adresse", "info"],
};

/** everything but the key, so a route may point it at another layer or rename it */
export type NearestFeatureApothekenConfig = NearestFeatureCategoryConfig;

export const NearestFeatureApotheken = ({
  config,
}: AddonComponentProps<"nearestFeatureApotheken">) => {
  useNearestFeatureCategory({ ...APOTHEKEN, ...config });
  return null;
};
