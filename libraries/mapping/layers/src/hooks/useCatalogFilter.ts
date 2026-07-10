import { useCallback, useMemo, useState } from "react";

import {
  buildKeywordFilterGroup,
  filterCategoriesByActiveFilters,
  type CatalogFilterGroup,
} from "../helper/catalogFilter";
import type { CatalogMainCategory } from "./useCatalogSearch";

const NO_ACTIVE_FILTERS: ReadonlySet<string> = new Set();
const NO_KEYWORD_FILTERS: string[] = [];

export const useCatalogFilter = ({
  categories,
  filterGroups,
}: {
  categories: CatalogMainCategory[];
  filterGroups: CatalogFilterGroup[];
}) => {
  const [activeFilterIds, setActiveFilterIds] = useState(NO_ACTIVE_FILTERS);
  const [keywordFilters, setKeywordFilters] = useState(NO_KEYWORD_FILTERS);

  const toggleFilter = useCallback((optionId: string) => {
    setActiveFilterIds((previous) => {
      const next = new Set(previous);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilterIds(NO_ACTIVE_FILTERS);
    setKeywordFilters(NO_KEYWORD_FILTERS);
  }, []);

  const filteredCategories = useMemo(() => {
    if (keywordFilters.length === 0) {
      return filterCategoriesByActiveFilters(
        categories,
        filterGroups,
        activeFilterIds
      );
    }
    const keywordGroup = buildKeywordFilterGroup(keywordFilters);
    return filterCategoriesByActiveFilters(
      categories,
      [...filterGroups, keywordGroup],
      new Set([
        ...activeFilterIds,
        ...keywordGroup.options.map((option) => option.id),
      ])
    );
  }, [categories, filterGroups, activeFilterIds, keywordFilters]);

  const activeFilterCount = activeFilterIds.size + keywordFilters.length;

  return {
    activeFilterIds,
    toggleFilter,
    clearFilters,
    keywordFilters,
    setKeywordFilters,
    activeFilterCount,
    filteredCategories,
  };
};
