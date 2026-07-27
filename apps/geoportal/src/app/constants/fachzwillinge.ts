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
import type { FachzwillingAddon } from "../addons/registry";

import {
  defaultVisibleControls,
  noVisibleControls,
  type UIVisibleControls,
} from "../store/slices/ui";

import { layerCatalogConfig } from "./discover";
import { gesundheitFachzwilling } from "./gesundheit";
import { bodenFachzwilling } from "./boden";
import { outletFachzwilling } from "./outlet";

/**
 * A Fachzwilling is a thematic geoportal variant: an own route whose layer
 * catalog is narrowed to the theme via always-active filters. Registering a
 * route here generates the hash route (main.tsx), the link card in the
 * "Fachzwillinge" subcategory of the "Teilzwillinge" catalog category and the
 * navbar breadcrumb (TopNavbar).
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
  addons?: FachzwillingAddon[];
};

export const fachzwillingRoutes: FachzwillingRoute[] = [
  gesundheitFachzwilling,
  bodenFachzwilling,
  outletFachzwilling,
];

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

/**
 * The default catalog categories with the "Fachzwillinge" subcategory merged
 * into the "Teilzwillinge" section (before "TopicMaps Wuppertal"). When the
 * active route defines workflow perspectives, a "Workflows" section is
 * appended after the Teilzwillinge; the default route passes no perspectives
 * and therefore shows no workflows.
 */
export const getGeoportalCategoryDefinitions = (
  perspectives?: WorkflowPerspective[]
): CategoryDefinition[] =>
  defaultCategoryDefinitions.flatMap((definition) =>
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

/** default geoportal category registry (no route-specific workflows) */
export const geoportalCategoryDefinitions: CategoryDefinition[] =
  getGeoportalCategoryDefinitions();
