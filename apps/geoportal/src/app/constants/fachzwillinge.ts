import { faDiagramProject } from "@fortawesome/free-solid-svg-icons";

import {
  defaultCategoryDefinitions,
  type CatalogFilters,
  type CategoryDefinition,
  type Item,
  type LayerCatalogConfig,
} from "@carma-mapping/layers";

import { layerCatalogConfig } from "./discover";
import { gesundheitFachzwilling } from "./gesundheit";
import { bodenFachzwilling } from "./boden";

/**
 * A Fachzwilling is a thematic geoportal variant: an own route whose layer
 * catalog is narrowed to the theme via always-active filters. Registering a
 * route here generates the hash route (main.tsx), the link card in the
 * "Fachzwillinge" catalog category and the navbar breadcrumb (TopNavbar).
 */
export type FachzwillingRoute = {
  /** hash-route path segment, e.g. "gesundheit" -> #/gesundheit */
  path: string;
  /** display title for the catalog card and the navbar breadcrumb */
  title: string;
  description?: string;
  thumbnail?: string;
  /** always-active catalog filters applied while the route is open */
  filters: CatalogFilters;
};

export const fachzwillingRoutes: FachzwillingRoute[] = [
  gesundheitFachzwilling,
  bodenFachzwilling,
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

const fachzwillingItems: Item[] = fachzwillingRoutes.map((route) => ({
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

/**
 * The default catalog categories plus a "Fachzwillinge" section (after the
 * Teilzwillinge) whose link cards are generated from the route registry.
 */
export const geoportalCategoryDefinitions: CategoryDefinition[] =
  defaultCategoryDefinitions.flatMap((definition) =>
    definition.id === "partialTwins"
      ? [
          definition,
          {
            id: FACHZWILLINGE_CATEGORY_ID,
            label: FACHZWILLINGE_CATEGORY_LABEL,
            icon: faDiagramProject,
            source: "static" as const,
            staticCategories: [
              {
                id: FACHZWILLINGE_CATEGORY_ID,
                Title: FACHZWILLINGE_CATEGORY_LABEL,
                layers: fachzwillingItems,
              },
            ],
          },
        ]
      : [definition]
  );
