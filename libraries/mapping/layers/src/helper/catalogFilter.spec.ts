import { describe, expect, it } from "vitest";
import { filterCategoriesByFilters } from "./catalogFilter";
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

describe("filterCategoriesByFilters", () => {
  it("returns the input tree unchanged without filters", () => {
    const result = filterCategoriesByFilters(categories, []);
    expect(result).toBe(categories);
  });

  it("filters by entity type", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "entityType", values: ["link"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
    expect(layerIds(result, "favorites")).toEqual([]);
  });

  it("OR-combines values within a filter", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "entityType", values: ["link", "collection"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
    expect(layerIds(result, "favorites")).toEqual(["savedCollection"]);
  });

  it("counts WMS layers with a carmaConf vectorStyle keyword as vector", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "layerType", values: ["vector"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual([
      "styledWmsLayer",
      "vectorLayer",
      "threeDMeasurement",
    ]);
  });

  it("matches only raster-rendered layers as WMS", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "layerType", values: ["wmts", "wmts-nt"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["rasterWmsLayer"]);
  });

  it("treats items without an explicit mapMode as 2D-only", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "mapMode", values: ["2d"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(
      allMapLayerIds.filter((id) => id !== "threeDMeasurement")
    );
  });

  it("matches explicit 3D items and objects as available in 3D", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "mapMode", values: ["3d"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual([
      "threeDMeasurement",
      "tilesetObject",
    ]);
  });

  it("AND-combines filters of a flat list", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "layerType", values: ["vector"] },
      { field: "mapMode", values: ["3d"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["threeDMeasurement"]);
  });

  it("OR-combines filter groups, AND-combining within each group", () => {
    const result = filterCategoriesByFilters(categories, [
      [
        { field: "layerType", values: ["vector"] },
        { field: "mapMode", values: ["3d"] },
      ],
      [{ field: "entityType", values: ["link"] }],
    ]);
    expect(layerIds(result, "mapLayers")).toEqual([
      "threeDMeasurement",
      "poiLink",
    ]);
  });

  it("ignores empty groups instead of matching everything", () => {
    const result = filterCategoriesByFilters(categories, [
      [],
      [{ field: "entityType", values: ["link"] }],
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
  });

  it("matches keyword filters case-insensitively as substrings", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "keywords", values: ["verkehr"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
  });

  it("shows items matching any of the keyword values", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "keywords", values: ["verkehr", "wasser"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["poiLink"]);
  });

  it("matches category filters via the containing main or sub category", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "category", values: ["favoriten"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual([]);
    expect(layerIds(result, "favorites")).toEqual(["savedCollection"]);
  });

  it("OR-combines main and sub category values", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "category", values: ["karten", "favorites"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(allMapLayerIds);
    expect(layerIds(result, "favorites")).toEqual(["savedCollection"]);
  });

  it("matches curated item ids exactly", () => {
    const result = filterCategoriesByFilters(categories, [
      { field: "id", values: ["vectorLayer", "savedCollection", "vector"] },
    ]);
    expect(layerIds(result, "mapLayers")).toEqual(["vectorLayer"]);
    expect(layerIds(result, "favorites")).toEqual(["savedCollection"]);
  });

  it("does not mutate the unfiltered tree, so removing filters restores it", () => {
    filterCategoriesByFilters(categories, [
      { field: "entityType", values: ["link"] },
    ]);
    expect(layerIds(categories, "mapLayers")).toEqual(allMapLayerIds);
  });
});
