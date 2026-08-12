import {
  buildWorkflowsCategoryDefinition,
  defaultCategoryDefinitions,
  type CatalogFilters,
  type CatalogSubCategory,
  type CategoryDefinition,
  type Item,
  type LayerCatalogConfig,
  type WorkflowPerspective,
} from "@carma-mapping/layers";
import {
  resolveFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";
import type { AddonEntry } from "@carma-mapping/addons";
import { resolveDeployment, type DeploymentTarget } from "@carma-commons/utils";

import {
  defaultVisibleControls,
  noVisibleControls,
  type UIVisibleControls,
} from "../../store/slices/ui";

import { layerCatalogConfig } from "../discover";
import { allFachzwillingRoutes } from "./routes";
import { getFeatureFlagConfig } from "../../config/featureFlags";

const currentDeployment = resolveDeployment();
const baseFeatureFlagConfig = getFeatureFlagConfig(currentDeployment);

/**
 * A Fachzwilling is a thematic geoportal variant: an own route whose layer
 * catalog is narrowed to the theme via always-active filters. Registering a
 * route here generates the hash route (main.tsx), the link card in the
 * "Fachzwillinge" subcategory of the "Themenzwillinge" catalog category and the
 * navbar breadcrumb (TopNavbar).
 *
 * Two independent gates apply:
 * - `availability` decides whether the route exists at all, i.e. whether it can
 *   be opened by its url. Without it the route is reachable on every deployment
 *   without any feature flag, see isRouteAvailable.
 * - featureFlagFachzwillinge ("fz") decides whether the routes are advertised
 *   in the catalog, see isFachzwillingeEnabled.
 */
export type FachzwillingUiOptions = Partial<UIVisibleControls> & {
  hideAll?: boolean;
};

/** resolve the sparse config into the full flags the ui slice expects */
export const resolveFachzwillingUi = (
  ui: FachzwillingUiOptions = {}
): UIVisibleControls => {
  const { hideAll = false, ...overrides } = ui;
  const baseline = hideAll ? noVisibleControls : defaultVisibleControls;
  return { ...baseline, ...overrides };
};

/**
 * Restricts where a route is reachable. Every given condition must hold; an
 * omitted condition is not checked, so an omitted `availability` means the
 * route is reachable by its url everywhere, without any feature flag.
 */
export type FachzwillingAvailability = {
  deployments?: DeploymentTarget[];
  featureFlag?: string;
};

type FachzwillingRouteBase = {
  /** hash-route path segment, e.g. "gesundheit" -> #/gesundheit */
  path: string;
  availability?: FachzwillingAvailability;
  ui?: FachzwillingUiOptions;
  disableMapInteraction?: boolean;
  /**
   * Stop the map from writing lat/lng/zoom to the url hash on every view
   * change. For routes whose view is driven externally, where those writes
   * would push history entries and seed the next reload's initial view.
   */
  disableHashWrite?: boolean;
  /**
   * Stop the map from re-requesting tiles when the server marks them stale.
   * Every such refresh repaints the tile through the raster fade, which is
   * visible in a window that is being screen-captured or projected.
   */
  disableExpiredTileRefresh?: boolean;
  /**
   * Hash key this route reads its shared layer config from, instead of the
   * app-wide `config`. That key is reserved geoportal-wide (it is stripped
   * after loading and omitted from generated share links), so a route that
   * needs its config to stay in the url must use a name of its own.
   */
  configHashKey?: string;
  /**
   * Storage namespace for the persisted mapping and ui state, instead of the
   * app-wide one. Same purpose as the `appKey` hash parameter: a route whose
   * layers are driven from outside would otherwise overwrite the settings of
   * the plain geoportal on the same origin. An explicit `?appKey=` still wins.
   *
   * Read at store construction time (store/index.ts), which is why the route
   * list lives in its own module and not in this barrel.
   */
  appKey?: string;
  /**
   * workflow perspectives shown in the "Workflows" catalog category while the
   * route is open; the category is omitted on routes without perspectives
   * (including the default geoportal route)
   */
  perspectives?: WorkflowPerspective<AddonEntry>[];
  addons?: AddonEntry[];
};

/** route reachable through the catalog, so it needs a card and its filters */
export type CatalogFachzwillingRoute = FachzwillingRouteBase & {
  hideFromCatalog?: false;
  /** display title for the catalog card and the navbar breadcrumb */
  title: string;
  description?: string;
  thumbnail?: string;
  /** always-active catalog filters applied while the route is open */
  filters: CatalogFilters;
};

/**
 * route only reachable by its url, without a catalog card; title and filters
 * are pointless here (and typically the catalog is not even openable), so both
 * stay optional
 */
export type HiddenFachzwillingRoute = FachzwillingRouteBase & {
  hideFromCatalog: true;
  title?: string;
  description?: string;
  thumbnail?: string;
  filters?: CatalogFilters;
};

export type FachzwillingRoute =
  | CatalogFachzwillingRoute
  | HiddenFachzwillingRoute;

export const routeFeatureFlagConfig: FeatureFlagConfig = Object.fromEntries(
  allFachzwillingRoutes
    .map((route) => route.availability?.featureFlag)
    .filter(
      (flagName): flagName is string =>
        !!flagName && !(flagName in baseFeatureFlagConfig)
    )
    .map((flagName) => [flagName, { alias: flagName, default: false }])
);

const activeFeatureFlags = resolveFeatureFlags({
  ...baseFeatureFlagConfig,
  ...routeFeatureFlagConfig,
});

const isFachzwillingeEnabled =
  activeFeatureFlags.featureFlagFachzwillinge === true;

const isRouteAvailable = ({ availability }: FachzwillingRoute): boolean => {
  if (!availability) {
    return true;
  }
  const { deployments, featureFlag } = availability;
  // an unresolvable deployment (unknown host) never satisfies a deployment list
  if (
    deployments &&
    (currentDeployment === null || !deployments.includes(currentDeployment))
  ) {
    return false;
  }
  if (featureFlag && activeFeatureFlags[featureFlag] !== true) {
    return false;
  }
  return true;
};

export const fachzwillingRoutes: FachzwillingRoute[] =
  allFachzwillingRoutes.filter(isRouteAvailable);

export const getFachzwillingCatalogConfig = (
  route: FachzwillingRoute
): LayerCatalogConfig => ({
  ...layerCatalogConfig,
  ...(route.filters ? { filters: route.filters } : {}),
});

export const findFachzwillingByPathname = (
  pathname: string
): FachzwillingRoute | undefined =>
  fachzwillingRoutes.find((route) => pathname === `/${route.path}`);

const FACHZWILLINGE_CATEGORY_ID = "fachzwillinge";
const FACHZWILLINGE_CATEGORY_LABEL = "Fachzwillinge";

const fachzwillingItems: Item[] = fachzwillingRoutes
  .filter((route): route is CatalogFachzwillingRoute => !route.hideFromCatalog)
  .map((route) => ({
    id: `fachzwilling_${route.path}`,
    name: `fachzwilling_${route.path}`,
    title: route.title,
    description: route.description ?? "",
    path: FACHZWILLINGE_CATEGORY_LABEL,
    type: "link",
    url: `#/${route.path}`,
    thumbnail: route.thumbnail,
    serviceName: FACHZWILLINGE_CATEGORY_ID,
  }));

const fachzwillingeSubCategory: CatalogSubCategory = {
  id: FACHZWILLINGE_CATEGORY_ID,
  Title: FACHZWILLINGE_CATEGORY_LABEL,
  layers: fachzwillingItems,
};

const preFachzwillingeCategoryLabels: Record<string, string> = {
  partialTwins: "Teilzwillinge",
  favoriteDigitalTwins: "Meine Teilzwillinge",
};

const withPreFachzwillingeCategoryLabels = (
  definitions: CategoryDefinition[]
): CategoryDefinition[] =>
  definitions.map((definition) => ({
    ...definition,
    label: preFachzwillingeCategoryLabels[definition.id] ?? definition.label,
    subCategories: definition.subCategories?.map((subCategory) => ({
      ...subCategory,
      label:
        preFachzwillingeCategoryLabels[subCategory.id] ?? subCategory.label,
    })),
  }));

/**
 * The default catalog categories with the "Fachzwillinge" subcategory merged
 * into the "Themenzwillinge" section (before "TopicMaps Wuppertal"). When the
 * active route defines workflow perspectives, a "Workflows" section is
 * appended after the Themenzwillinge; the default route passes no perspectives
 * and therefore shows no workflows. While the feature flag is off, the
 * categories keep their previous labels instead.
 */
export const getGeoportalCategoryDefinitions = (
  perspectives?: WorkflowPerspective<AddonEntry>[]
): CategoryDefinition[] => {
  if (!isFachzwillingeEnabled) {
    return withPreFachzwillingeCategoryLabels(defaultCategoryDefinitions);
  }
  return defaultCategoryDefinitions.flatMap((definition) =>
    definition.id === "partialTwins"
      ? [
          {
            ...definition,
            staticCategories: [
              fachzwillingeSubCategory,
              ...(definition.staticCategories ?? []),
            ],
          },
          ...(perspectives?.length
            ? [buildWorkflowsCategoryDefinition(perspectives)]
            : []),
        ]
      : [definition]
  );
};

/** default geoportal category registry (no route-specific workflows) */
export const geoportalCategoryDefinitions: CategoryDefinition[] =
  getGeoportalCategoryDefinitions();
