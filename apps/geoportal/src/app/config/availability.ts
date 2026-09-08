import {
  resolveDeployment,
  type Availability,
  type AvailabilityContext,
} from "@carma-commons/utils";
import {
  resolveFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";

import { allFachzwillingRoutes } from "../constants/fachzwillinge/routes";
import type { FachzwillingRoute } from "../constants/fachzwillinge";
import { getFeatureFlagConfig } from "./featureFlags";

/**
 * The context every `availability` in the app is resolved against: routes,
 * their perspectives and workflows, and the addons of routes and of the app.
 * Built once at module load, like the routes themselves. Flags given in the
 * url hash are honoured because `resolveFeatureFlags` reads the hash at load;
 * a flag toggled later needs a reload, the same as for routes today.
 */
export const currentDeployment = resolveDeployment();

const baseFeatureFlagConfig = getFeatureFlagConfig(currentDeployment);

/** every availability declared anywhere inside a route */
const collectRouteAvailabilities = (route: FachzwillingRoute): Availability[] => [
  ...(route.availability ? [route.availability] : []),
  ...(route.perspectives ?? []).flatMap((perspective) => [
    ...(perspective.availability ? [perspective.availability] : []),
    ...perspective.workflows.flatMap((workflow) =>
      workflow.availability ? [workflow.availability] : []
    ),
  ]),
  ...(route.addons ?? []).flatMap((addon) =>
    typeof addon !== "string" && addon.availability ? [addon.availability] : []
  ),
];

/**
 * Feature flags only referenced by an availability, so they resolve (default
 * off, alias equal to the name) without an entry in the base config. Flags on
 * the app's default addons (app.config.ts) are not collected here, that module
 * imports this one; they belong in the base config.
 */
export const routeFeatureFlagConfig: FeatureFlagConfig = Object.fromEntries(
  allFachzwillingRoutes
    .flatMap(collectRouteAvailabilities)
    .map((availability) => availability.featureFlag)
    .filter(
      (flagName): flagName is string =>
        !!flagName && !(flagName in baseFeatureFlagConfig)
    )
    .map((flagName) => [flagName, { alias: flagName, default: false }])
);

export const activeFeatureFlags = resolveFeatureFlags({
  ...baseFeatureFlagConfig,
  ...routeFeatureFlagConfig,
});

export const availabilityContext: AvailabilityContext = {
  deployment: currentDeployment,
  featureFlags: activeFeatureFlags,
};
