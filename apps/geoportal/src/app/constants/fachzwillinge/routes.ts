import { gesundheitFachzwilling } from "./gesundheit";
import { bodenFachzwilling } from "./boden";
import { outletFachzwilling } from "./outlet";
import { addonsFachzwilling } from "./addons";
import { kommunalePlanungFachzwilling } from "./kommunalePlanung";
import { workflowsFachzwilling } from "./workflows";

import type { FachzwillingRoute } from ".";

/**
 * The registered Fachzwillinge, kept out of the barrel so consumers that only
 * need the raw route list do not pull the barrel's catalog and feature-flag
 * machinery with it. The store needs exactly that: the barrel imports the ui
 * slice for its control defaults and the ui slice imports the store back, so
 * reading a route from the barrel while the store is being built would close a
 * cycle. Importing the barrel for the type only is fine, that import erases.
 */
export const allFachzwillingRoutes: FachzwillingRoute[] = [
  gesundheitFachzwilling,
  bodenFachzwilling,
  outletFachzwilling,
  addonsFachzwilling,
  kommunalePlanungFachzwilling,
  workflowsFachzwilling,
];
