import { describe, expect, it } from "vitest";

import {
  getShownCategories,
  mainCategoryHasResults,
} from "./categoryDisplay";
import type {
  CatalogMainCategory,
  CatalogSubCategory,
} from "../hooks/useCatalogSearch";
import type { SavedLayerConfig } from "../lib/contracts/carma-layers.d";

const layer = (id: string): SavedLayerConfig =>
  ({ id, title: id } as SavedLayerConfig);

const categories: CatalogMainCategory[] = [
  {
    id: "mapLayers",
    categories: [
      { Title: "Karten", id: "karten", layers: [layer("a")] },
      { Title: "Leer", id: "leer", layers: [] },
      {
        Title: "Leer versteckt",
        id: "leerVersteckt",
        layers: [],
        hideWhenEmpty: true,
      },
    ],
  },
  {
    id: "favorites",
    categories: [{ Title: "Favoriten", id: "favoriten", layers: [] }],
  },
];

const sidebarEntries = [
  { id: "mapLayers", label: "Kartenebenen" },
  { id: "favorites", label: "Favoriten" },
  { id: "searchResults", label: "Suchergebnisse" },
];

const titles = (result: CatalogSubCategory[] | null) =>
  result?.map((subCategory) => subCategory.Title);

describe("getShownCategories", () => {
  it("keeps empty subcategories unless they are hideWhenEmpty", () => {
    const result = getShownCategories(
      categories,
      "mapLayers",
      sidebarEntries,
      ""
    );
    expect(titles(result)).toEqual(["Karten", "Leer"]);
  });

  it("drops every empty subcategory with hideEmpty", () => {
    const result = getShownCategories(
      categories,
      "mapLayers",
      sidebarEntries,
      "",
      true
    );
    expect(titles(result)).toEqual(["Karten"]);
  });

  it("drops empty search-result pseudo categories with hideEmpty", () => {
    const withoutHide = getShownCategories(
      categories,
      "searchResults",
      sidebarEntries,
      "such"
    );
    expect(titles(withoutHide)).toEqual(["Kartenebenen", "Favoriten"]);

    const withHide = getShownCategories(
      categories,
      "searchResults",
      sidebarEntries,
      "such",
      true
    );
    expect(titles(withHide)).toEqual(["Kartenebenen"]);
  });
});

describe("mainCategoryHasResults", () => {
  it("reports whether a main category holds any items", () => {
    expect(mainCategoryHasResults(categories, "mapLayers")).toBe(true);
    expect(mainCategoryHasResults(categories, "favorites")).toBe(false);
    expect(mainCategoryHasResults(categories, "unknown")).toBe(false);
  });
});
