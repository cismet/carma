import { describe, expect, it, vi } from "vitest";
import type { Item } from "../lib/contracts/carma-layers.d";
import { additionalLayersToCategories } from "./useAdditionalLayers";

const POI_STYLE = "https://tiles.cismet.de/poi/style.json";
const BODEN_STYLE = "https://tiles.cismet.de/boden/style.json";

const styles = {
  [POI_STYLE]: {
    metadata: { carmaConf: { layerInfo: { title: "POI" } } },
  },
  [BODEN_STYLE]: {
    metadata: { carmaConf: { layerInfo: { title: "Bodenrichtwerte" } } },
  },
};

describe("additionalLayersToCategories", () => {
  it("turns a bare style url into a title-less category in the custom category", () => {
    const categories = additionalLayersToCategories([POI_STYLE], styles);
    expect(categories).toHaveLength(1);
    expect(categories[0].Title).toBeUndefined();
    expect(categories[0].layers[0]).toMatchObject({
      id: `custom:${POI_STYLE}`,
      title: "POI",
      layerType: "vector",
      path: "Externe Dienste",
    });
  });

  it("files a style url of a titled entry in that entry's category", () => {
    const categories = additionalLayersToCategories(
      [{ Title: "Test Kategorie", layers: [BODEN_STYLE] }],
      styles
    );
    expect(categories[0]).toMatchObject({
      Title: "Test Kategorie",
      // derived so the entry forms a subcategory of its own
      serviceName: "test-kategorie",
    });
    expect(categories[0].layers[0]).toMatchObject({
      title: "Bodenrichtwerte",
      path: "Test Kategorie",
    });
  });

  it("reads a bare string that is no url as a reference to a catalog item", () => {
    const categories = additionalLayersToCategories(
      [
        {
          Title: "Test Kategorie",
          layers: [
            "wuppKarten:expsw_str_hnr",
            { layerId: "wuppPlanung:baudenkmale" },
          ],
        },
      ],
      styles
    );
    expect(categories[0].layers).toEqual([
      { refId: "wuppKarten:expsw_str_hnr", path: "Test Kategorie" },
      { refId: "wuppPlanung:baudenkmale", path: "Test Kategorie" },
    ]);
  });

  it("keeps an explicit serviceName and mixes urls, references and full items", () => {
    const item = {
      id: "boden:zonen",
      title: "Richtwertzonen",
      type: "layer",
    } as Item;
    const categories = additionalLayersToCategories(
      [
        {
          Title: "Boden",
          serviceName: "boden",
          layers: [item, POI_STYLE, "wuppKarten:expg"],
        },
      ],
      styles
    );
    expect(categories[0].serviceName).toBe("boden");
    expect(
      categories[0].layers.map((layer) =>
        "refId" in layer ? layer.refId : layer.title
      )
    ).toEqual(["Richtwertzonen", "POI", "wuppKarten:expg"]);
  });

  it("leaves out a style that is not loaded yet", () => {
    const categories = additionalLayersToCategories(
      [{ Title: "Test Kategorie", layers: [POI_STYLE, BODEN_STYLE] }],
      { [POI_STYLE]: styles[POI_STYLE] }
    );
    expect(categories[0].layers).toHaveLength(1);
    expect(categories[0].layers[0]).toMatchObject({ title: "POI" });
  });

  it("drops layers rewriting the service structure, and categories left empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const categories = additionalLayersToCategories(
      [
        {
          Title: "Test Kategorie",
          layers: [{ id: "a", mergeId: "wuppPlanung:a" } as unknown as Item],
        },
        { Title: "Leer", layers: [] },
      ],
      styles
    );
    expect(categories).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
