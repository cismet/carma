import { useMemo } from "react";

import {
  defaultCategoryDefinitions,
  useCatalogData,
} from "@carma-mapping/layers";

export type SelectOption = { value: string; label: string };
export type SelectOptionGroup = { label: string; options: SelectOption[] };

// covers Item as well as the SavedLayerConfig items of static categories
type SuggestionItem = {
  id?: string;
  title: string;
  keywords?: string[];
  tags?: string[];
};

type SuggestionCategory = {
  id?: string;
  Title: string;
  layers: SuggestionItem[];
};

/**
 * Value suggestions for the filter builder, derived from the loaded service
 * capabilities plus the static partial-twin categories. Discover items are
 * fetched inside the catalog view and not part of the suggestions; their ids
 * can still be entered as free text.
 */
export const useCatalogSuggestions = () => {
  const { serviceCategories } = useCatalogData();

  return useMemo(() => {
    const staticCategories: SuggestionCategory[] =
      defaultCategoryDefinitions.flatMap((definition) =>
        (definition.staticCategories ?? []).map((category) => ({
          id: category.id,
          Title: category.Title,
          layers: category.layers,
        }))
      );
    const allCategories: SuggestionCategory[] = [
      ...serviceCategories,
      ...staticCategories,
    ];

    const idOptions: SelectOptionGroup[] = allCategories
      .map((category) => ({
        label: category.Title,
        options: category.layers
          .filter((layer): layer is SuggestionItem & { id: string } =>
            Boolean(layer.id)
          )
          .map((layer) => ({
            value: layer.id,
            label: `${layer.title} (${layer.id})`,
          })),
      }))
      .filter((group) => group.options.length > 0);

    const keywordSet = new Set<string>();
    allCategories.forEach((category) =>
      category.layers.forEach((layer) => {
        [...(layer.keywords ?? []), ...(layer.tags ?? [])].forEach(
          (keyword) => {
            if (!keyword.startsWith("carmaConf://")) {
              keywordSet.add(keyword);
            }
          }
        );
      })
    );
    const keywordOptions: SelectOption[] = [...keywordSet]
      .sort((a, b) => a.localeCompare(b))
      .map((keyword) => ({ value: keyword, label: keyword }));

    const categoryOptions: SelectOptionGroup[] = [
      {
        label: "Hauptkategorien",
        options: defaultCategoryDefinitions
          .filter((definition) => definition.source !== "searchResults")
          .map((definition) => ({
            value: definition.id,
            label: `${definition.label} (${definition.id})`,
          })),
      },
      {
        label: "Subkategorien",
        options: allCategories
          .filter((category): category is SuggestionCategory & { id: string } =>
            Boolean(category.id)
          )
          .map((category) => ({
            value: category.id,
            label: `${category.Title} (${category.id})`,
          })),
      },
    ];

    return { idOptions, keywordOptions, categoryOptions };
  }, [serviceCategories]);
};
