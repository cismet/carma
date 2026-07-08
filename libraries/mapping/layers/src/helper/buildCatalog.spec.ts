import { describe, expect, it } from "vitest";
import type { Item } from "../lib/contracts/carma-layers.d";
import {
  applyCatalogDrop,
  buildCatalog,
  deriveAdditionalConfigFragments,
  deriveConfigSubcategories,
  deriveFeaturedSubcategory,
  EMPTY_DROPPED_CATALOG,
  extractReplaceLayers,
  mergeAdditionalConfigs,
} from "./buildCatalog";
import type { CatalogConfigEntry, ServiceCategory } from "./buildCatalog";
import {
  defaultCategoryDefinitions,
  resolveCustomCategories,
} from "../config/categoryDefinitions";
import type { CustomCategoryDefinition } from "../config/categoryDefinitions";

const item = (id: string, title: string, extra: Partial<Item> = {}): Item =>
  ({
    id,
    title,
    description: "",
    type: "layer",
    serviceName: id.split(":")[0],
    ...extra,
  } as Item);

const serviceCategories: ServiceCategory[] = [
  {
    Title: "Karten",
    id: "wuppKarten",
    layers: [
      item("wuppKarten:alkomgw", "Stadtgrundkarte"),
      item("wuppKarten:expg", "Strichkarte"),
    ],
  },
];

const emptySources = {
  serviceCategories: [],
  additionalConfig: [],
};

describe("buildCatalog", () => {
  it("builds the main categories in sidebar order", () => {
    const catalog = buildCatalog(
      { ...emptySources, serviceCategories },
      { featureFlags: {} }
    );
    expect(catalog.map((category) => category.id)).toEqual([
      "favorites",
      "partialTwins",
      "mapLayers",
      "sensors",
      "objects",
    ]);
    const mapLayers = catalog.find((category) => category.id === "mapLayers");
    expect(mapLayers?.categories[0]).toMatchObject({
      id: "wuppKarten",
      Title: "Karten",
    });
    expect(mapLayers?.categories[0].layers).toHaveLength(2);
  });

  it("merges titled additional configs as own subcategory and filters feature flags", () => {
    const additionalConfig: CatalogConfigEntry[] = [
      {
        Title: "Zusatzebenen",
        serviceName: "zusatzTest",
        layers: [
          item("zusatzTest:a", "Sichtbar"),
          item("zusatzTest:b", "Verborgen", { ff: "testFlag" }),
        ],
      },
    ];
    const catalog = buildCatalog(
      { ...emptySources, serviceCategories, additionalConfig },
      { featureFlags: {} }
    );
    const mapLayers = catalog.find((category) => category.id === "mapLayers");
    const zusatz = mapLayers?.categories.find((c) => c.id === "zusatzTest");
    expect(zusatz?.Title).toBe("Zusatzebenen");
    expect(zusatz?.layers.map((layer) => layer.title)).toEqual(["Sichtbar"]);
  });

  it("derives the featured window into a 'Neu' subcategory at the front", () => {
    const featuredCategories: ServiceCategory[] = [
      {
        Title: "Karten",
        id: "wuppKarten",
        layers: [
          item("wuppKarten:neu", "Neuer Layer", {
            keywords: ["carmaconf://featuredFrom:2000.01.01"],
          }),
        ],
      },
    ];
    const featured = deriveFeaturedSubcategory(featuredCategories);
    expect(featured).toMatchObject({ id: "featured", Title: "Neu" });
    expect(featured?.layers[0]).toMatchObject({
      serviceName: "featured",
      path: "Neu",
    });

    const catalog = buildCatalog(
      { ...emptySources, serviceCategories: featuredCategories },
      { featureFlags: {} }
    );
    const mapLayers = catalog.find((category) => category.id === "mapLayers");
    expect(mapLayers?.categories[0].id).toBe("featured");
  });

  it("gives custom categories the favorites section and lets them override by id", () => {
    const catalog = buildCatalog(
      { ...emptySources, serviceCategories },
      {
        featureFlags: {},
        customCategories: [
          { id: "favoriteLayers", Title: "Meine Ebenen", layers: [] },
          {
            id: "wuppKarten",
            Title: "Karten (App)",
            mainCategoryId: "mapLayers",
            layers: [item("app:1", "App Layer")],
          },
        ],
      }
    );
    const favorites = catalog.find((category) => category.id === "favorites");
    expect(favorites?.categories.map((c) => c.id)).toEqual(["favoriteLayers"]);

    const mapLayers = catalog.find((category) => category.id === "mapLayers");
    const wuppKarten = mapLayers?.categories.filter(
      (c) => c.id === "wuppKarten"
    );
    expect(wuppKarten).toHaveLength(1);
    expect(wuppKarten?.[0].Title).toBe("Karten (App)");
  });
});

describe("category registry", () => {
  it("assembles main categories in registry order, configs keyed by id", () => {
    const catalog = buildCatalog(
      {
        ...emptySources,
        serviceCategories,
        categoryConfigs: {
          extra: [
            {
              Title: "Extra Inhalte",
              serviceName: "extra",
              layers: [item("extra:1", "Extra Layer")],
            },
          ],
        },
      },
      {
        featureFlags: {},
        categoryDefinitions: [
          {
            id: "extra",
            label: "Extra",
            icon: defaultCategoryDefinitions[0].icon,
            source: "configs",
          },
          defaultCategoryDefinitions.find(
            (definition) => definition.id === "mapLayers"
          )!,
        ],
      }
    );
    expect(catalog.map((category) => category.id)).toEqual([
      "extra",
      "mapLayers",
    ]);
    expect(catalog[0].categories[0].layers[0].title).toBe("Extra Layer");
  });

  it("resolves custom category definitions against the favorites", () => {
    const favorites = [
      item("fav_a", "Twin", { serviceName: "wuppTopicMaps" }),
      item("fav_b", "Layer", { serviceName: "wuppKarten" }),
    ];
    const definitions: CustomCategoryDefinition[] = [
      {
        id: "favoriteDigitalTwins",
        label: "Meine Teilzwillinge",
        source: {
          kind: "favorites",
          filter: (entry) => entry.serviceName === "wuppTopicMaps",
        },
      },
      {
        id: "leafletOnly",
        label: "Nur 2D",
        hiddenIn3D: true,
        source: { kind: "items", items: [item("x:1", "X")] },
      },
      {
        id: "measurements",
        label: "Meine Messungen",
        keepItemServiceName: true,
        source: {
          kind: "items",
          items: [item("m:1", "M", { serviceName: "own" })],
        },
      },
    ];

    const resolved = resolveCustomCategories(definitions, favorites, [], false);
    expect(resolved.map((category) => category.id)).toEqual([
      "favoriteDigitalTwins",
      "leafletOnly",
      "measurements",
    ]);
    // favorites narrowed by the predicate, serviceName/path stamped
    expect(resolved[0].layers).toEqual([
      expect.objectContaining({
        id: "fav_a",
        serviceName: "favoriteDigitalTwins",
        path: "Meine Teilzwillinge",
      }),
    ]);
    // keepItemServiceName leaves the item's own serviceName untouched
    expect(resolved[2].layers[0]).toMatchObject({
      serviceName: "own",
      path: "Meine Messungen",
    });

    // hiddenIn3D definitions drop out while the 3D map is active
    const resolvedIn3D = resolveCustomCategories(
      definitions,
      favorites,
      [],
      true
    );
    expect(resolvedIn3D.map((category) => category.id)).toEqual([
      "favoriteDigitalTwins",
      "measurements",
    ]);
  });

  it("resolves collections-sourced categories from the savedCollections", () => {
    const resolved = resolveCustomCategories(
      [
        {
          id: "collections",
          label: "Meine Karten",
          source: { kind: "collections" },
        },
      ],
      [],
      [item("saved:1", "Meine Zusammenstellung", { type: "collection" })],
      false
    );
    expect(resolved[0].layers).toEqual([
      expect.objectContaining({
        id: "saved:1",
        serviceName: "collections",
        path: "Meine Karten",
      }),
    ]);
  });
});

describe("deriveConfigSubcategories", () => {
  it("skips title-less and flag-hidden entries, earlier configs win on id", () => {
    const configs: CatalogConfigEntry[] = [
      {
        Title: "Boden (Drop)",
        serviceName: "boden",
        layers: [item("boden:drop", "Dropped Sensor")],
      },
      {
        Title: "Boden",
        serviceName: "boden",
        layers: [item("boden:drop", "Fetched Sensor")],
      },
      { serviceName: "ohneTitel", layers: [item("x:1", "Nope")] },
      {
        Title: "Leer",
        serviceName: "leer",
        layers: [item("leer:1", "Flagged", { ff: "off" })],
      },
    ];
    const subCategories = deriveConfigSubcategories(configs, {});
    expect(subCategories).toHaveLength(1);
    expect(subCategories[0].Title).toBe("Boden (Drop)");
    expect(subCategories[0].layers.map((layer) => layer.title)).toEqual([
      "Dropped Sensor",
    ]);
  });
});

describe("additional config handling", () => {
  const baseConfig: CatalogConfigEntry[] = [
    {
      layers: [
        item("wuppKarten:expg", "Ersatzkarte", {
          replaceId: "wuppKarten:expg",
        }),
      ],
    },
    {
      Title: "Zusatzebenen",
      serviceName: "zusatzTest",
      layers: [item("zusatzTest:a", "Zusatz Testlayer")],
    },
  ];

  it("extracts replace layers only from title-less configs", () => {
    const replaceLayers = extractReplaceLayers(baseConfig, {});
    expect(replaceLayers.map((layer) => layer.id)).toEqual(["wuppKarten:expg"]);
  });

  it("keeps replace layers out of the catalog fragments", () => {
    const fragments = deriveAdditionalConfigFragments(baseConfig, {});
    expect(fragments.map((fragment) => fragment.id)).toEqual(["zusatzTest"]);
  });

  it("overlays dropped configs: override by id, extend matching config, append new", () => {
    const overlays: CatalogConfigEntry[] = [
      {
        Title: "Zusatzebenen",
        serviceName: "zusatzTest",
        layers: [
          item("zusatzTest:a", "Zusatz Testlayer (geändert)"),
          item("zusatzTest:neu", "Neuer Zusatz"),
        ],
      },
      {
        Title: "Drop Kategorie",
        serviceName: "dropTest",
        layers: [item("dropTest:1", "Drop Testlayer")],
      },
      {
        layers: [
          item("drop:alkomgw", "WMS Ersatz", {
            replaceId: "wuppKarten:alkomgw",
          }),
        ],
      },
    ];
    const merged = mergeAdditionalConfigs(baseConfig, overlays);

    const zusatz = merged.find((config) => config.Title === "Zusatzebenen");
    expect(zusatz?.layers.map((layer) => layer.title)).toEqual([
      "Zusatz Testlayer (geändert)",
      "Neuer Zusatz",
    ]);

    expect(
      merged.find((config) => config.Title === "Drop Kategorie")
    ).toBeTruthy();

    // the unmatched replace layer extends the title-less base config
    const titleless = merged.find((config) => !config.Title);
    expect(titleless?.layers.map((layer) => layer.id)).toEqual([
      "wuppKarten:expg",
      "drop:alkomgw",
    ]);
    expect(extractReplaceLayers(merged, {}).map((l) => l.replaceId)).toEqual([
      "wuppKarten:expg",
      "wuppKarten:alkomgw",
    ]);
  });
});

describe("applyCatalogDrop", () => {
  it("puts dropped layers first and upserts by id", () => {
    const first = applyCatalogDrop(EMPTY_DROPPED_CATALOG, {
      kind: "layers",
      items: [item("custom:a", "A"), item("custom:b", "B")],
    });
    const second = applyCatalogDrop(first, {
      kind: "layers",
      items: [item("custom:a", "A v2")],
    });
    expect(second.customLayers.map((layer) => layer.title)).toEqual([
      "A v2",
      "B",
    ]);
    expect(second.customLayers[0].path).toBe("Externe Dienste");
  });

  it("prepends dropped category and layer configs", () => {
    const withCategory = applyCatalogDrop(EMPTY_DROPPED_CATALOG, {
      kind: "categoryConfig",
      categoryId: "sensors",
      configs: [{ Title: "Boden", serviceName: "boden", layers: [] }],
    });
    const withLayerConfig = applyCatalogDrop(withCategory, {
      kind: "layerConfig",
      configs: [{ Title: "Drop", serviceName: "drop", layers: [] }],
    });
    expect(withLayerConfig.categoryConfigs["sensors"]).toHaveLength(1);
    expect(withLayerConfig.layerConfigs[0].Title).toBe("Drop");
  });

  it("shows dropped layers as the first mapLayers subcategory in the catalog", () => {
    const dropped = applyCatalogDrop(EMPTY_DROPPED_CATALOG, {
      kind: "layers",
      items: [item("custom:style", "Dropped Style")],
    });
    const catalog = buildCatalog(
      { ...emptySources, serviceCategories, dropped },
      { featureFlags: {} }
    );
    const mapLayers = catalog.find((category) => category.id === "mapLayers");
    expect(mapLayers?.categories[0]).toMatchObject({
      id: "custom",
      Title: "Externe Dienste",
    });
    expect(mapLayers?.categories[0].layers[0].title).toBe("Dropped Style");
  });

  it("feeds dropped sensor configs into the sensors category before fetched ones", () => {
    const dropped = applyCatalogDrop(EMPTY_DROPPED_CATALOG, {
      kind: "categoryConfig",
      categoryId: "sensors",
      configs: [
        {
          Title: "Boden (Drop)",
          serviceName: "boden",
          layers: [item("boden:drop", "Dropped Sensor")],
        },
      ],
    });
    const catalog = buildCatalog(
      {
        ...emptySources,
        categoryConfigs: {
          sensors: [
            {
              Title: "Luft",
              serviceName: "luft",
              layers: [item("luft:1", "Luftsensor")],
            },
          ],
        },
        dropped,
      },
      { featureFlags: {} }
    );
    const sensors = catalog.find((category) => category.id === "sensors");
    expect(sensors?.categories.map((c) => c.Title)).toEqual([
      "Boden (Drop)",
      "Luft",
    ]);
  });
});
