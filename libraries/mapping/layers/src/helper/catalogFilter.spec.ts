import { describe, expect, it } from "vitest";
import {
  buildCategoryFilterGroup,
  buildKeywordFilterGroup,
  defaultCatalogFilterGroups,
  filterCategoriesByActiveFilters,
  type CatalogFilterGroup,
} from "./catalogFilter";
import type { CatalogMainCategory } from "../hooks/useCatalogSearch";

const item = (
  id: string,
  overrides: Record<string, unknown> = {}
): CatalogMainCategory["categories"][number]["layers"][number] =>
  ({
    id,
    title: id,
    description: "",
    type: "layer",
    serviceName: "karten",
    ...overrides,
  } as CatalogMainCategory["categories"][number]["layers"][number]);

const categories: CatalogMainCategory[] = [
  {
    id: "mapLayers",
    categories: [
      {
        Title: "Karten",
        id: "karten",
        layers: [
          item("rasterWmsLayer", { layerType: "wmts" }),
          item("styledWmsLayer", {
            layerType: "wmts",
            keywords: ["carmaConf://vectorStyle:https://example.test/style.json"],
          }),
          item("vectorLayer", { layerType: "vector" }),
          item("threeDMeasurement", { layerType: "vector", mapMode: "3d" }),
          item("poiLink", { type: "link", keywords: ["POI", "Verkehr"] }),
          item("tilesetObject", { type: "object", layerType: "tileset" }),
        ],
      },
    ],
  },
  {
    id: "favorites",
    categories: [
      {
        Title: "Favoriten",
        id: "favoriten",
        layers: [item("savedCollection", { type: "collection" })],
      },
    ],
  },
];

const allMapLayerIds = [
  "rasterWmsLayer",
  "styledWmsLayer",
  "vectorLayer",
  "threeDMeasurement",
  "poiLink",
  "tilesetObject",
];

const layerIds = (result: CatalogMainCategory[], mainId: string) =>
  result
    .find((category) => category.id === mainId)
    ?.categories.flatMap((subCategory) =>
      subCategory.layers.map((layer) => layer.id)
    );

describe("filterCategoriesByActiveFilters", () => {
  it("returns the input tree unchanged without active filters", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set()
    );
    expect(result).toBe(categories);
  });

  it("filters by entity type", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["entityType:link"])
    );
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
    expect(layerIds(result, "favorites")).toEqual([]);
  });

  it("OR-combines options within a group", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["entityType:link", "entityType:collection"])
    );
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
    expect(layerIds(result, "favorites")).toEqual(["savedCollection"]);
  });

  it("counts WMS layers with a carmaConf vectorStyle keyword as vector", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["layerType:vector"])
    );
    expect(layerIds(result, "mapLayers")).toEqual([
      "styledWmsLayer",
      "vectorLayer",
      "threeDMeasurement",
    ]);
  });

  it("matches only raster-rendered layers as WMS", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["layerType:wms"])
    );
    expect(layerIds(result, "mapLayers")).toEqual(["rasterWmsLayer"]);
  });

  it("treats items without an explicit mapMode as 2D-only", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["mapMode:2d"])
    );
    expect(layerIds(result, "mapLayers")).toEqual(
      allMapLayerIds.filter((id) => id !== "threeDMeasurement")
    );
  });

  it("matches explicit 3D items and objects as available in 3D", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["mapMode:3d"])
    );
    expect(layerIds(result, "mapLayers")).toEqual([
      "threeDMeasurement",
      "tilesetObject",
    ]);
  });

  it("AND-combines groups", () => {
    const result = filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["layerType:vector", "mapMode:3d"])
    );
    expect(layerIds(result, "mapLayers")).toEqual(["threeDMeasurement"]);
  });

  it("matches custom keyword filters case-insensitively", () => {
    const keywordGroups: CatalogFilterGroup[] = [
      {
        id: "topics",
        label: "Themen",
        options: [
          {
            id: "topics:verkehr",
            label: "Verkehr",
            field: "keywords",
            values: ["verkehr"],
          },
        ],
      },
    ];
    const result = filterCategoriesByActiveFilters(
      categories,
      keywordGroups,
      new Set(["topics:verkehr"])
    );
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
  });

  it("shows items matching any of the entered keyword filters", () => {
    const keywordGroup = buildKeywordFilterGroup(["verkehr", "wasser"]);
    const result = filterCategoriesByActiveFilters(
      categories,
      [keywordGroup],
      new Set(keywordGroup.options.map((option) => option.id))
    );
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
  });

  it("OR-combines main and sub selections of the built category group", () => {
    const categoryGroup = buildCategoryFilterGroup([
      {
        id: "mapLayers",
        label: "Kartenebenen",
        subCategories: [{ id: "karten", label: "Karten" }],
      },
      {
        id: "favorites",
        label: "Favoriten",
        subCategories: [{ id: "favoriten", label: "Favoriten" }],
      },
    ]);
    const result = filterCategoriesByActiveFilters(
      categories,
      [categoryGroup],
      new Set(["category:karten", "category:favorites"])
    );
    expect(layerIds(result, "mapLayers")).toEqual(allMapLayerIds);
    expect(layerIds(result, "favorites")).toEqual(["savedCollection"]);
  });

  it("matches category filters via the containing main or sub category", () => {
    const categoryGroups: CatalogFilterGroup[] = [
      {
        id: "categories",
        label: "Kategorien",
        options: [
          {
            id: "categories:favoriten",
            label: "Favoriten",
            field: "category",
            values: ["favoriten"],
          },
        ],
      },
    ];
    const result = filterCategoriesByActiveFilters(
      categories,
      categoryGroups,
      new Set(["categories:favoriten"])
    );
    expect(layerIds(result, "mapLayers")).toEqual([]);
    expect(layerIds(result, "favorites")).toEqual(["savedCollection"]);
  });

  it("does not mutate the unfiltered tree, so clearing filters restores it", () => {
    filterCategoriesByActiveFilters(
      categories,
      defaultCatalogFilterGroups,
      new Set(["entityType:link"])
    );
    expect(layerIds(categories, "mapLayers")).toEqual(allMapLayerIds);
  });
});
