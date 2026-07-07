/* eslint-disable @typescript-eslint/no-explicit-any */
import WMSCapabilities from "wms-capabilities";

import capabilitiesKartenXml from "../test/fixtures/capabilities-karten.xml?raw";
import type { ExtendedItem } from "../lib/contracts/carma-layers.d";
import { baseConfig } from "./config";
import {
  extractVectorStyles,
  findDifferences,
  findLayerAndAddTags,
  flattenLayer,
  getAllLeafLayers,
  getInteractionButtons,
  getLayerStructure,
  mergeStructures,
  normalizeObject,
  parseDescription,
  reorderLayersByInsertRules,
  customCategoryToLayers,
  wmsLayerToGenericItem,
} from "./layerHelper";

// @ts-expect-error constructor typing of the umd module
const parser = new WMSCapabilities();

const parseFixture = () => parser.toJSON(capabilitiesKartenXml);

describe("getInteractionButtons", () => {
  it("returns an empty array for undefined", () => {
    expect(getInteractionButtons(undefined)).toEqual([]);
  });

  it("wraps a single button into an array", () => {
    const button = { title: "Test" } as any;
    expect(getInteractionButtons(button)).toEqual([button]);
  });

  it("returns arrays unchanged", () => {
    const buttons = [{ title: "A" }, { title: "B" }] as any;
    expect(getInteractionButtons(buttons)).toEqual(buttons);
  });
});

describe("reorderLayersByInsertRules", () => {
  const layers = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("keeps layers without hints unchanged", () => {
    expect(reorderLayersByInsertRules(layers)).toEqual(layers);
  });

  it("moves a layer behind its insertAfterId target", () => {
    const input = [
      { id: "x", insertAfterId: "b" },
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ];
    expect(reorderLayersByInsertRules(input).map((l) => l.id)).toEqual([
      "a",
      "b",
      "x",
      "c",
    ]);
  });

  it("appends the layer when the insertAfterId target is missing", () => {
    const input = [{ id: "x", insertAfterId: "missing" }, { id: "a" }];
    expect(reorderLayersByInsertRules(input).map((l) => l.id)).toEqual([
      "a",
      "x",
    ]);
  });

  it("places layers by insertPosition", () => {
    const input = [
      { id: "a" },
      { id: "b" },
      { id: "x", insertPosition: 1 },
      { id: "c" },
    ];
    expect(reorderLayersByInsertRules(input).map((l) => l.id)).toEqual([
      "a",
      "x",
      "b",
      "c",
    ]);
  });

  it("clamps out-of-range insertPosition to the end", () => {
    const input = [{ id: "a" }, { id: "x", insertPosition: 99 }, { id: "b" }];
    expect(reorderLayersByInsertRules(input).map((l) => l.id)).toEqual([
      "a",
      "b",
      "x",
    ]);
  });

  it("prefers insertPosition when both hints are present", () => {
    const input = [
      { id: "x", insertAfterId: "b", insertPosition: 0 },
      { id: "a" },
      { id: "b" },
    ];
    expect(reorderLayersByInsertRules(input).map((l) => l.id)).toEqual([
      "x",
      "a",
      "b",
    ]);
  });
});

describe("parseDescription", () => {
  it("returns an empty array for empty input", () => {
    expect(parseDescription("")).toEqual([]);
  });

  it("falls back to a single Inhalt section when no known title is present", () => {
    expect(parseDescription("  Nur ein Text ohne Struktur.  ")).toEqual([
      { title: "Inhalt", description: "Nur ein Text ohne Struktur." },
    ]);
  });

  it("splits a description into its titled sections", () => {
    const description =
      "Inhalt: Beschreibung der Ebene. Sichtbarkeit: öffentlich. Nutzung: frei nutzbar.";
    expect(parseDescription(description)).toEqual([
      { title: "Inhalt", description: "Beschreibung der Ebene." },
      { title: "Sichtbarkeit", description: "öffentlich." },
      { title: "Nutzung", description: "frei nutzbar." },
    ]);
  });

  it("prepends leading text to the Inhalt section when multiple titles exist", () => {
    const description =
      "Vorspann ohne Titel. Inhalt: Eigentlicher Inhalt. Nutzung: frei.";
    const result = parseDescription(description);
    expect(result[0].title).toBe("Inhalt");
    expect(result[0].description).toContain("Vorspann ohne Titel.");
    expect(result[0].description).toContain("Eigentlicher Inhalt.");
  });
});

describe("extractVectorStyles", () => {
  it("returns null when no carmaConf keyword is present", () => {
    expect(extractVectorStyles(["Grundkarte", "Wuppertal"])).toBeNull();
  });

  it("extracts a property and keeps colons in the value", () => {
    expect(
      extractVectorStyles([
        "carmaConf://vectorStyle:https://example.test/style.json",
      ])
    ).toEqual({ vectorStyle: "https://example.test/style.json" });
  });

  it("accumulates multiple carmaConf keywords", () => {
    expect(
      extractVectorStyles([
        "carmaConf://vectorStyle:https://example.test/style.json",
        "carmaConf://minZoom:12",
      ])
    ).toEqual({
      vectorStyle: "https://example.test/style.json",
      minZoom: "12",
    });
  });
});

describe("flattenLayer", () => {
  it("flattens nested layers, keeps only named leaf layers and inherits parent titles as tags", () => {
    const root = {
      Title: "Root",
      Layer: [
        {
          Title: "Gruppe",
          Layer: [
            { Title: "Blatt A", Name: "leaf_a" },
            { Title: "Unbenannte Gruppe", Name: "" },
          ],
        },
        { Title: "Blatt B", Name: "leaf_b" },
      ],
    };

    const result = flattenLayer(root, [], "https://example.test/wms?");

    expect(result.layers.map((l: any) => l.Name)).toEqual(["leaf_a", "leaf_b"]);
    const leafA = result.layers.find((l: any) => l.Name === "leaf_a");
    expect(leafA.tags).toEqual(["Root", "Gruppe", "Blatt A"]);
    expect(leafA.url).toBe("https://example.test/wms?");
  });
});

describe("wmsLayerToGenericItem", () => {
  it("returns null for a missing layer", () => {
    expect(wmsLayerToGenericItem(null as any, "wuppKarten")).toBeNull();
  });

  it("maps an XML layer to a generic item with zoom levels from the ScaleHint", () => {
    const item = wmsLayerToGenericItem(
      {
        Title: "Stadtgrundkarte (grau)",
        Name: "alkomgw",
        Abstract: "Inhalt: Test.",
        tags: ["Wurzel"],
        KeywordList: ["Grundkarte"],
        queryable: true,
        ScaleHint: { min: 0, max: 2999999.99999937 },
      } as any,
      "wuppKarten",
      "Basis"
    );

    expect(item).toMatchObject({
      id: "wuppKarten:alkomgw",
      name: "alkomgw",
      title: "Stadtgrundkarte (grau)",
      type: "layer",
      layerType: "wmts",
      serviceName: "wuppKarten",
      path: "Basis",
      queryable: true,
      // min ScaleHint of 0 falls back to the default of 24
      maxZoom: 24,
      minZoom: -4,
    });
  });

  it("uses the zoom defaults when no ScaleHint exists", () => {
    const item = wmsLayerToGenericItem(
      { Title: "T", Name: "n" } as any,
      "svc"
    );
    expect(item?.maxZoom).toBe(24);
    expect(item?.minZoom).toBe(0);
    expect(item?.path).toBe("");
  });
});

describe("normalizeObject", () => {
  it("removes undefined values recursively and keeps arrays", () => {
    expect(
      normalizeObject({
        a: 1,
        b: undefined,
        c: { d: undefined, e: "x" },
        f: [{ g: undefined, h: 2 }],
      })
    ).toEqual({ a: 1, c: { e: "x" }, f: [{ h: 2 }] });
  });

  it("passes through primitives and null", () => {
    expect(normalizeObject(null)).toBeNull();
    expect(normalizeObject("test")).toBe("test");
  });
});

describe("findLayerAndAddTags", () => {
  const buildCapabilityLayer = () => ({
    Title: "Root",
    Layer: [
      {
        Title: "Gruppe",
        Layer: [{ Title: "Blatt", Name: "leaf" }],
      },
    ],
  });

  it("finds a nested layer and collects the parent titles as tags", () => {
    const found = findLayerAndAddTags(buildCapabilityLayer(), "leaf", []);
    expect(found.Name).toBe("leaf");
    expect(found.tags).toEqual(["Root", "Gruppe"]);
  });

  it("returns null when the layer does not exist", () => {
    expect(findLayerAndAddTags(buildCapabilityLayer(), "missing", [])).toBeNull();
  });
});

describe("mergeStructures", () => {
  it("merges categories by title and concatenates their layers", () => {
    const merged = mergeStructures(
      [{ Title: "Basis", id: "wuppKarten", layers: [{ id: "a" }] }],
      [
        { Title: "Basis", id: "wuppKarten", layers: [{ id: "b" }] },
        { Title: "Umwelt", id: "wuppUmwelt", layers: [] },
      ]
    );

    expect(merged).toEqual([
      {
        Title: "Basis",
        id: "wuppKarten",
        layers: [{ id: "a" }, { id: "b" }],
      },
      { Title: "Umwelt", id: "wuppUmwelt", layers: [] },
    ]);
  });
});

describe("customCategoryToLayers", () => {
  it("merges category keywords into every layer", () => {
    const result = customCategoryToLayers({
      keywords: ["kategorie"],
      layers: [{ id: "a", keywords: ["eigen"] }, { id: "b" }],
    });
    expect(result[0].keywords).toEqual(["eigen", "kategorie"]);
    expect(result[1].keywords).toEqual(["kategorie"]);
  });
});

describe("capabilities fixture pipeline", () => {
  it("parses the fixture and lists all leaf layers", () => {
    const wms = parseFixture();
    const leafNames = getAllLeafLayers(wms).map((l: any) => l.Name);
    expect(leafNames).toEqual(["alkomgw", "expg", "albsf", "abkf", "testneu"]);
  });

  it("finds the layers that are missing in the config", () => {
    const wms = parseFixture();
    const kartenConfigLayers = (baseConfig as any).karten.layers;
    const { missingInConfig } = findDifferences(
      getAllLeafLayers(wms) as any,
      kartenConfigLayers
    );
    expect(missingInConfig.map((l: any) => l.Name)).toEqual(["testneu"]);
  });
});

describe("getLayerStructure characterization", () => {
  const buildStructure = (replaceLayers?: ExtendedItem[]) =>
    getLayerStructure({
      config: baseConfig,
      wms: parseFixture(),
      serviceName: "wuppKarten",
      skipTopicMaps: true,
      replaceLayers,
    });

  it("fills only the matching category and leaves the others empty", () => {
    const structure = buildStructure();
    const basis = structure.find((cat) => cat.Title === "Basis");
    expect(basis).toBeDefined();
    expect(basis!.layers.length).toBeGreaterThan(0);

    structure
      .filter((cat) => cat.Title !== "Basis")
      .forEach((cat) => {
        expect(cat.layers).toEqual([]);
      });

    expect(structure.map((cat) => cat.Title)).not.toContain("TopicMaps");
  });

  it("derives the Basis layers from config and capabilities", () => {
    const structure = buildStructure();
    const basis = structure.find((cat) => cat.Title === "Basis")!;
    const ids = basis.layers.map((layer: any) => layer.id);

    // configured layers found in the capabilities
    expect(ids).toContain("wuppKarten:alkomgw");
    expect(ids).toContain("wuppKarten:expg");
    expect(ids).toContain("wuppKarten:albsf");
    // hidden via carmaconf://hideLayer keyword
    expect(ids).not.toContain("wuppKarten:abkf");
    // present in the capabilities but not in the config: appended at the end
    expect(ids[ids.length - 1]).toBe("wuppKarten:testneu");
  });

  it("keeps the per-layer contract for a fully configured layer", () => {
    const structure = buildStructure();
    const basis = structure.find((cat) => cat.Title === "Basis")!;
    const alkomgw: any = basis.layers.find(
      (layer: any) => layer.id === "wuppKarten:alkomgw"
    );

    expect(alkomgw).toMatchObject({
      title: "Stadtgrundkarte (grau)",
      name: "alkomgw",
      // queryable because a carmaconf://infoBoxMapping keyword exists
      queryable: true,
      // thumbnail extracted from the carmaConf://thumbnail keyword
      thumbnail: "https://example.test/vorschau/alkomgw.png",
      // spread in from the baseConfig entry
      layerType: "wmts-nt",
      icon: "basis/Stadtgrundkarte_Graustufen_ABK",
      maxZoom: 24,
      minZoom: -4,
    });
    expect(alkomgw.tags[0]).toBe("Basis");
    expect(alkomgw.service).toEqual({
      url: "https://maps.wuppertal.de/karten",
      name: "wuppKarten",
    });
    expect(alkomgw.props.url).toBe("https://maps.wuppertal.de/karten?");
    expect(alkomgw.props.Style[0].LegendURL[0].OnlineResource).toBe(
      "https://example.test/legenden/alkomgw-legende.png"
    );
  });

  it("marks layers without infoBoxMapping keyword as not queryable", () => {
    const structure = buildStructure();
    const basis = structure.find((cat) => cat.Title === "Basis")!;
    const expg: any = basis.layers.find(
      (layer: any) => layer.id === "wuppKarten:expg"
    );
    expect(expg.queryable).toBe(false);
    expect(expg.thumbnail).toBeUndefined();
  });

  it("replaces a layer when a replaceId matches", () => {
    const structure = buildStructure([
      {
        replaceId: "wuppKarten:expg",
        id: "wuppKarten:expg",
        type: "layer",
        title: "ALKIS Ersatzkarte (Test)",
        vectorStyle: "https://example.test/styles/expg.style.json",
      } as unknown as ExtendedItem,
    ]);
    const basis = structure.find((cat) => cat.Title === "Basis")!;
    const titles = basis.layers.map((layer: any) => layer.title);

    expect(titles).toContain("ALKIS Ersatzkarte (Test)");
    expect(titles).not.toContain("ALKIS Strichkarte (gelb)");
    const replaced: any = basis.layers.find(
      (layer: any) => layer.title === "ALKIS Ersatzkarte (Test)"
    );
    expect(replaced.serviceName).toBe("wuppKarten");
  });

  it("merges config values over the capabilities layer when a mergeId matches", () => {
    const structure = buildStructure([
      {
        mergeId: "wuppKarten:albsf",
        id: "wuppKarten:albsf",
        type: "layer",
        title: "Schätzungskarte (vektorisiert)",
        keywords: ["carmaConf://vectorStyle:https://example.test/albsf.json"],
        props: { zusatz: true },
      } as unknown as ExtendedItem,
    ]);
    const basis = structure.find((cat) => cat.Title === "Basis")!;
    const merged: any = basis.layers.find(
      (layer: any) => layer.id === "wuppKarten:albsf"
    );

    expect(merged.title).toBe("Schätzungskarte (vektorisiert)");
    // keywords of both sides survive the merge
    expect(merged.keywords).toContain("Bodenschätzung");
    expect(merged.keywords).toContain(
      "carmaConf://vectorStyle:https://example.test/albsf.json"
    );
    // props are deep merged, the capabilities side stays available
    expect(merged.props.zusatz).toBe(true);
    expect(merged.props.Name).toBe("albsf");
  });

  it("matches the recorded snapshot of the Basis category", () => {
    const structure = buildStructure();
    const basis = structure.find((cat) => cat.Title === "Basis");
    expect(basis).toMatchSnapshot();
  });
});
