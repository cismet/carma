import { gesundheitFachzwilling } from "./gesundheit";
import { bodenFachzwilling } from "./boden";
import { outletFachzwilling } from "./outlet";
import { addonsFachzwilling } from "./addons";
import { kommunalePlanungFachzwilling } from "./kommunalePlanung";
import { nachhaltigeStadtentwicklungFachzwilling } from "./nachhaltigeStadtentwicklung";
import { klimawandelUndAnpassungFachzwilling } from "./klimawandelUndAnpassung";
import { zukunftsfaehigeMobilitaetFachzwilling } from "./zukunftsfaehigeMobilitaet";
import { urbaneResilienzFachzwilling } from "./urbaneResilienz";
import { parksUndGruenanlagenFachzwilling } from "./parksUndGruenanlagen";
import { workflowsFachzwilling } from "./workflows";
import { projectionMappingFachzwilling } from "./projectionMapping";

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
  kommunalePlanungFachzwilling,
  nachhaltigeStadtentwicklungFachzwilling,
  klimawandelUndAnpassungFachzwilling,
  zukunftsfaehigeMobilitaetFachzwilling,
  urbaneResilienzFachzwilling,
  parksUndGruenanlagenFachzwilling,
  bodenFachzwilling,
  gesundheitFachzwilling,
  outletFachzwilling,
  addonsFachzwilling,
  workflowsFachzwilling,
  projectionMappingFachzwilling,
];

/**
 * The route registered for a hash path such as "/gesundheit", availability
 * not applied: for the boot-time lookups (storage namespace, background) that
 * run before the barrel's filtered list exists.
 */
export const findFachzwillingRouteByPath = (
  routePath: string
): FachzwillingRoute | undefined =>
  allFachzwillingRoutes.find((route) => routePath === `/${route.path}`);
