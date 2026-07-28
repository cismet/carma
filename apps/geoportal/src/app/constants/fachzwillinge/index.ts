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
import { resolveFeatureFlags } from "@carma-providers/feature-flag";
import type { Addon } from "@carma-mapping/addons";

import {
  defaultVisibleControls,
  noVisibleControls,
  type UIVisibleControls,
} from "../../store/slices/ui";

import { layerCatalogConfig } from "../discover";
import { gesundheitFachzwilling } from "./gesundheit";
import { bodenFachzwilling } from "./boden";
import { outletFachzwilling } from "./outlet";
import { featureFlagConfig } from "../../config/featureFlags";

const isFachzwillingeEnabled =
  resolveFeatureFlags(featureFlagConfig).featureFlagFachzwillinge === true;

/**
 * A Fachzwilling is a thematic geoportal variant: an own route whose layer
 * catalog is narrowed to the theme via always-active filters. Registering a
 * route here generates the hash route (main.tsx), the link card in the
 * "Fachzwillinge" subcategory of the "Themenzwillinge" catalog category and the
 * navbar breadcrumb (TopNavbar). All of it only while featureFlagFachzwillinge
 * is active, see isFachzwillingeEnabled.
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

export type FachzwillingRoute = {
  /** hash-route path segment, e.g. "gesundheit" -> #/gesundheit */
  path: string;
  /** display title for the catalog card and the navbar breadcrumb */
  title: string;
  description?: string;
  thumbnail?: string;
  /** always-active catalog filters applied while the route is open */
  filters: CatalogFilters;
  hideFromCatalog?: boolean;
  ui?: FachzwillingUiOptions;
  disableMapInteraction?: boolean;
  /**
   * workflow perspectives shown in the "Workflows" catalog category while the
   * route is open; the category is omitted on routes without perspectives
   * (including the default geoportal route)
   */
  perspectives?: WorkflowPerspective[];
  addons?: Addon[];
};

export const fachzwillingRoutes: FachzwillingRoute[] = isFachzwillingeEnabled
  ? [gesundheitFachzwilling, bodenFachzwilling, outletFachzwilling]
  : [];

export const getFachzwillingCatalogConfig = (
  route: FachzwillingRoute
): LayerCatalogConfig => ({
  ...layerCatalogConfig,
  filters: route.filters,
});

export const findFachzwillingByPathname = (
  pathname: string
): FachzwillingRoute | undefined =>
  fachzwillingRoutes.find((route) => pathname === `/${route.path}`);

const FACHZWILLINGE_CATEGORY_ID = "fachzwillinge";
const FACHZWILLINGE_CATEGORY_LABEL = "Fachzwillinge";

const fachzwillingItems: Item[] = fachzwillingRoutes
  .filter((route) => !route.hideFromCatalog)
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
  perspectives?: WorkflowPerspective[]
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
