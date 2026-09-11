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
 * else changes, and the mode is not touched. A *variant* of this one is not a
 * new file but a second declaration of this addon with its own config: the
 * pharmacies on duty today are
 *
 *   {
 *     addon: "nearestFeatureApotheken",
 *     config: {
 *       id: "apothekenNotdienst",
 *       label: "Apotheken mit Notdienst",
 *       where: ({ heute }) => heute === true,
 *     },
 *   }
 *
 * which reads the `heute` column the pipeline writes into the layer's
 * `features.json` (`FEATURE_INDEX_PROPERTIES=heute,morgen`).
 */

const APOTHEKEN: NearestFeatureCategory = {
  id: "apotheken",
  label: "Apotheken",
  icon: faPrescriptionBottleMedical,
  layerId: "wuppInfra:apotheken",
  labelProperties: ["name", "NAME", "bezeichnung", "Bezeichnung", "titel"],
  detailProperties: ["strasse", "Strasse", "adresse", "Adresse", "info"],
};

/** any part of the definition, so a route may rename it, filter it or declare a variant */
export type NearestFeatureApothekenConfig = NearestFeatureCategoryConfig;

export const NearestFeatureApotheken = ({
  config,
}: AddonComponentProps<"nearestFeatureApotheken">) => {
  useNearestFeatureCategory({ ...APOTHEKEN, ...config });
  return null;
};
