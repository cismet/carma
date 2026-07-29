import { Deployment } from "@carma-commons/utils";
import type { DeploymentTarget } from "@carma-commons/utils";

import type {
  CatalogMainCategory,
  CatalogSubCategory,
} from "../hooks/useCatalogSearch";

const RESTRICT_KEYWORD_PREFIX = "carmaconf://restrict:";

const DEPLOYMENT_TARGETS = Object.values(Deployment) as DeploymentTarget[];

/** an item is restricted when it declares `restrict` or carries the keyword */
export type RestrictableItem = {
  restrict?: DeploymentTarget | DeploymentTarget[] | string | string[];
  keywords?: string[];
};

const isDeploymentTarget = (value: string): value is DeploymentTarget =>
  DEPLOYMENT_TARGETS.includes(value as DeploymentTarget);

const splitTargets = (value: string): DeploymentTarget[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(isDeploymentTarget);

export const getRestrictedDeployments = (
  item: RestrictableItem
): DeploymentTarget[] => {
  const fromProperty = Array.isArray(item.restrict)
    ? item.restrict.flatMap((entry) => splitTargets(entry))
    : item.restrict
    ? splitTargets(item.restrict)
    : [];

  const fromKeywords = (item.keywords ?? []).flatMap((keyword) => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized.startsWith(RESTRICT_KEYWORD_PREFIX)) {
      return [];
    }
    return splitTargets(keyword.trim().slice(RESTRICT_KEYWORD_PREFIX.length));
  });

  return [...new Set([...fromProperty, ...fromKeywords])];
};

export const isItemAvailableInDeployment = (
  item: RestrictableItem,
  deployment: DeploymentTarget | null | undefined
): boolean => {
  if (!deployment) {
    return true;
  }
  const restricted = getRestrictedDeployments(item);
  return restricted.length === 0 || !restricted.includes(deployment);
};

export const filterCategoriesByDeployment = (
  categories: CatalogMainCategory[],
  deployment: DeploymentTarget | null | undefined
): CatalogMainCategory[] => {
  if (!deployment) {
    return categories;
  }
  return categories.map((mainCategory) => ({
    ...mainCategory,
    categories: mainCategory.categories.reduce<CatalogSubCategory[]>(
      (subCategories, subCategory) => {
        const layers = subCategory.layers.filter((layer) =>
          isItemAvailableInDeployment(layer as RestrictableItem, deployment)
        );
        if (layers.length === 0 && subCategory.layers.length > 0) {
          return subCategories;
        }
        subCategories.push({ ...subCategory, layers });
        return subCategories;
      },
      []
    ),
  }));
};
