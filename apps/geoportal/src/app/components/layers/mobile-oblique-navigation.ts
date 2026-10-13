import { OBLIQUE_LAYER_ID } from "@carma-mapping/addons";
import { entryHasInfoView, type LayerStackEntry } from "@carma-mapping/layers";

import { findFachzwillingByPathname } from "../../constants/fachzwillinge";

/** The route registry already applies the canonical deployment availability. */
export const isMobileObliqueRouteAvailable = (): boolean =>
  findFachzwillingByPathname("/oblique") !== undefined;

/** Only the installed Oblique row may replace the narrow background action.
 * Root-route feature flags and local file imports install the same row. */
export const findMobileObliqueEntry = (
  visitorLayers: readonly LayerStackEntry[]
): LayerStackEntry | undefined =>
  [...visitorLayers]
    .reverse()
    .find((entry) => entry.id === OBLIQUE_LAYER_ID && entryHasInfoView(entry));
