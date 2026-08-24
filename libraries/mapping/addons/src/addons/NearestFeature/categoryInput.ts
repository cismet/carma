import type { DynamicSearchGroup } from "@carma-mapping/fuzzy-search";

import type { NearestFeatureCategory } from "./categoryChannel";

/**
 * The grammar of the mode's input: which stage a string is in, and what the
 * user typed behind the category once it is in the second one.
 */

/**
 * What the input carries once a category is picked: "Apotheken: ". Matching it
 * back ignores the space, because the input field does not always keep a
 * trailing one, and a category that no longer matches its own prefix would put
 * the first stage back on screen forever.
 */
export const CATEGORY_SEPARATOR = ": ";

export const categoryPrefix = (category: NearestFeatureCategory) =>
  `${category.label}:`;

/** the value a first-stage row carries, which is the second stage's empty input */
export const categoryInputValue = (category: NearestFeatureCategory) =>
  `${category.label}${CATEGORY_SEPARATOR}`;

/** the part typed behind the category, or `null` when this is not its stage */
export const queryForCategory = (
  input: string,
  category: NearestFeatureCategory
): string | null => {
  const trimmed = input.trimStart();
  const prefix = categoryPrefix(category);
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return null;
  }
  return trimmed.slice(prefix.length).trim();
};

/** the category whose stage this input is in, if any */
export const categoryForInput = (
  input: string,
  categories: NearestFeatureCategory[]
): NearestFeatureCategory | undefined =>
  categories.find((candidate) => queryForCategory(input, candidate) !== null);

/** stage 1: which kind of place, filtered by what is typed so far */
export const categoryGroup = (
  input: string,
  categories: NearestFeatureCategory[]
): DynamicSearchGroup => {
  if (categories.length === 0) {
    // the mode is on the route but no category addon is; say so rather than
    // opening an empty dropdown
    return {
      title: "Wonach in der Nähe?",
      options: [
        {
          value: "",
          label: "Keine Kategorien vorhanden",
          detail: "Diese Route deklariert kein Kategorie-Addon",
        },
      ],
    };
  }
  const query = input.trim().toLowerCase();
  const matches = categories.filter(
    (candidate) => query === "" || candidate.label.toLowerCase().includes(query)
  );
  return {
    title: "Wonach in der Nähe?",
    options: matches.map((candidate) => ({
      value: categoryInputValue(candidate),
      label: candidate.label,
      ...(candidate.icon ? { icon: candidate.icon } : {}),
      drilldown: true,
    })),
  };
};
