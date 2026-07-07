import { describe, expect, it } from "vitest";
import {
  createSearchIndex,
  filterCategoriesBySearchTerm,
  findFirstCategoryIdWithResults,
  type CatalogMainCategory,
} from "./useCatalogSearch";

const layer = (id: string, title: string, serviceName: string) => ({
  id,
  title,
  description: "",
  type: "layer",
  serviceName,
});

const categories: CatalogMainCategory[] = [
  {
    id: "mapLayers",
    categories: [
      {
        Title: "Karten",
        id: "karten",
        layers: [
          layer("l1", "Stadtgrundkarte", "karten"),
          layer("l2", "Luftbild", "karten"),
        ],
      },
      {
        Title: "Umwelt",
        id: "umwelt",
        layers: [layer("l3", "Stadtklima", "umwelt")],
      },
    ],
  },
  {
    id: "sensors",
    categories: [
      {
        Title: "Boden",
        id: "boden",
        layers: [layer("l4", "Bodenfeuchte Stadt", "boden")],
      },
    ],
  },
];

describe("filterCategoriesBySearchTerm", () => {
  it("returns the input tree unchanged for an empty search term", () => {
    const index = createSearchIndex(categories);
    const result = filterCategoriesBySearchTerm(
      categories,
      index,
      "",
      new Set()
    );
    expect(result).toBe(categories);
  });

  it("matches results back into their sub categories via serviceName", () => {
    const index = createSearchIndex(categories);
    const result = filterCategoriesBySearchTerm(
      categories,
      index,
      "Stadt",
      new Set()
    );

    const mapLayers = result.find((category) => category.id === "mapLayers");
    const karten = mapLayers?.categories.find((sub) => sub.id === "karten");
    const umwelt = mapLayers?.categories.find((sub) => sub.id === "umwelt");
    const boden = result
      .find((category) => category.id === "sensors")
      ?.categories.find((sub) => sub.id === "boden");

    expect(karten?.layers.map((l) => l.id)).toEqual(["l1"]);
    expect(umwelt?.layers.map((l) => l.id)).toEqual(["l3"]);
    expect(boden?.layers.map((l) => l.id)).toEqual(["l4"]);
  });

  it("empties sub categories of disabled main categories", () => {
    const index = createSearchIndex(categories);
    const result = filterCategoriesBySearchTerm(
      categories,
      index,
      "Stadt",
      new Set(["sensors"])
    );

    const boden = result
      .find((category) => category.id === "sensors")
      ?.categories.find((sub) => sub.id === "boden");
    expect(boden?.layers).toEqual([]);
  });

  it("does not mutate the unfiltered tree, so clearing the search restores it", () => {
    const index = createSearchIndex(categories);
    filterCategoriesBySearchTerm(categories, index, "Luftbild", new Set());

    const karten = categories[0].categories[0];
    expect(karten.layers.map((l) => l.id)).toEqual(["l1", "l2"]);
  });
});

describe("findFirstCategoryIdWithResults", () => {
  it("returns the first main category containing at least one layer", () => {
    const empty: CatalogMainCategory = {
      id: "favorites",
      categories: [{ Title: "Favoriten", id: "favoriten", layers: [] }],
    };
    expect(findFirstCategoryIdWithResults([empty, ...categories])).toBe(
      "mapLayers"
    );
  });

  it("returns undefined when nothing has results", () => {
    expect(findFirstCategoryIdWithResults([])).toBeUndefined();
  });
});
