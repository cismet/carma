import {
  buildWorkflowsCategoryDefinition,
  defaultCategoryDefinitions,
  filterPerspectivesByAvailability,
  type AdditionalLayerEntry,
  type CatalogFilters,
  type CatalogSubCategory,
  type CategoryDefinition,
  type Item,
  type LayerCatalogConfig,
  type WorkflowPerspective,
} from "@carma-mapping/layers";
import { filterAddonsByAvailability, type AddonEntry } from "@carma-mapping/addons";
import type { NamedLayers } from "@carma-appframeworks/portals";
import { isAvailable, type Availability } from "@carma-commons/utils";

import {
  defaultVisibleControls,
  noVisibleControls,
  type UIVisibleControls,
} from "../../store/slices/ui";

import { layerCatalogConfig } from "../discover";
import { allFachzwillingRoutes } from "./routes";
import {
  activeFeatureFlags,
  availabilityContext,
} from "../../config/availability";

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
 *   without any feature flag. The same option gates a route's perspectives,
 *   workflows and addons individually, see resolveRouteContents.
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
 * Route-scoped base map overrides. They are applied where the background is
 * turned into map layers (useRouteBackground) and never dispatched, so the
 * store keeps saying what the app-wide catalog says. That matters because the
 * background is persisted: a route that wrote its own layer string into the
 * store would still be showing it after navigating back to the plain geoportal.
 */
export type FachzwillingBackgroundConfig = {
  namedLayers?: NamedLayers;
  layerMap?: Record<string, { layers: string }>;
};

type FachzwillingRouteBase = {
  /** hash-route path segment, e.g. "gesundheit" -> #/gesundheit */
  path: string;
  /**
   * Where the route is reachable by its url. Perspectives, workflows and addons
   * carry the same option; theirs only counts once the route has passed.
   */
  availability?: Availability;
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
   * Storage namespace for the persisted mapping and ui state, overriding the
   * route's path. Every Fachzwilling is already namespaced by its path, so this
   * is only for a route that wants a name unhooked from its url: one that
   * should keep its stored state across a path rename, or two routes that are
   * meant to share one record. An explicit `?appKey=` still wins over both.
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
  background?: FachzwillingBackgroundConfig;
  /**
   * Layers this route adds to the catalog on top of the services: vector style
   * urls and ids of catalog layers, each group under a Title of its own. They
   * ignore the route's `filters`, since a filter config cannot know a layer
   * that is declared here.
   */
  additionalLayers?: AdditionalLayerEntry[];
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

const isFachzwillingeEnabled =
  activeFeatureFlags.featureFlagFachzwillinge === true;

/**
 * The route with only the perspectives, workflows and addons that are
 * available here, so everything downstream keeps reading `route.perspectives`
 * and `route.addons` as declared.
 */
const resolveRouteContents = (route: FachzwillingRoute): FachzwillingRoute => ({
  ...route,
  ...(route.perspectives
    ? {
        perspectives: filterPerspectivesByAvailability(
          route.perspectives,
          availabilityContext
        ),
      }
    : {}),
  ...(route.addons
    ? { addons: filterAddonsByAvailability(route.addons, availabilityContext) }
    : {}),
});

export const fachzwillingRoutes: FachzwillingRoute[] = allFachzwillingRoutes
  .filter((route) => isAvailable(route.availability, availabilityContext))
  .map(resolveRouteContents);

export const getFachzwillingCatalogConfig = (
  route: FachzwillingRoute
): LayerCatalogConfig => ({
  ...layerCatalogConfig,
  ...(route.filters ? { filters: route.filters } : {}),
  ...(route.additionalLayers
    ? { additionalLayers: route.additionalLayers }
    : {}),
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
 * and therefore shows no workflows. The workflows do not depend on the
 * Fachzwillinge feature flag: a route that defines perspectives is already
 * gated by its own availability. While the flag is off, the categories keep
 * their previous labels and the "Fachzwillinge" subcategory is left out.
 */
export const getGeoportalCategoryDefinitions = (
  perspectives?: WorkflowPerspective<AddonEntry>[]
): CategoryDefinition[] => {
  const workflowsCategory = perspectives?.length
    ? [buildWorkflowsCategoryDefinition(perspectives)]
    : [];
  const baseDefinitions = isFachzwillingeEnabled
    ? defaultCategoryDefinitions
    : withPreFachzwillingeCategoryLabels(defaultCategoryDefinitions);
  return baseDefinitions.flatMap((definition) =>
    definition.id === "partialTwins"
      ? [
          isFachzwillingeEnabled
            ? {
                ...definition,
                staticCategories: [
                  fachzwillingeSubCategory,
                  ...(definition.staticCategories ?? []),
                ],
              }
            : definition,
          ...workflowsCategory,
        ]
      : [definition]
  );
};

/** default geoportal category registry (no route-specific workflows) */
export const geoportalCategoryDefinitions: CategoryDefinition[] =
  getGeoportalCategoryDefinitions();
