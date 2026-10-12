import { OBLIQUE_LAYER_ID } from "@carma-mapping/addons";
import { entryHasInfoView, type LayerStackEntry } from "@carma-mapping/layers";

import { findFachzwillingByPathname } from "../../constants/fachzwillinge";

/** The route registry already applies the canonical deployment availability. */
export const isMobileObliqueRouteAvailable = (): boolean =>
  findFachzwillingByPathname("/oblique") !== undefined;

/** Only the Oblique row may replace the narrow background-button action. */
export const findMobileObliqueEntry = (
  visitorLayers: readonly LayerStackEntry[],
  pathname: string
): LayerStackEntry | undefined =>
  pathname === "/oblique"
    ? [...visitorLayers]
        .reverse()
        .find((entry) => entry.id === OBLIQUE_LAYER_ID && entryHasInfoView(entry))
    : undefined;
