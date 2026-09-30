import { describe, expect, it, vi } from "vitest";

import type { MappingConfig } from "@carma-api";

import { backgroundAsLayers } from "./background-as-layers";

// the pm-show route's two base maps and the services they name
const layerMap = {
  stadtplanOhneSchrift: {
    title: "Stadtplan (ohne Schrift)",
    layers: "stadtplan_ohne_schrift@100",
  },
  trueOrtho2024: {
    title: "True Orthofoto 03/24",
    layers: "trueOrtho2024@100",
  },
};
const namedLayers = {
  stadtplan_ohne_schrift: {
    type: "vector",
    style: "https://tiles.cismet.de/stadtplan/ohne_schrift.style.json",
  },
  trueOrtho2024: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2024",
  },
  rvrGrundriss: {
    type: "wmts",
    url: "https://geodaten.metropoleruhr.de/spw2",
    layers: "spw2_light_grundriss",
  },
  esri: { type: "tiles", url: "https://tiles.example/{z}/{y}/{x}" },
};

const overlay = { id: "wuppUmwelt:Klimafunktion", title: "Klimafunktion" };

const configWith = (
  backgroundLayer: MappingConfig["backgroundLayer"]
): MappingConfig => ({ layers: [overlay], backgroundLayer });

describe("backgroundAsLayers", () => {
  it("puts a WMS base map under the layers and drops the choice", () => {
    const result = backgroundAsLayers(
      configWith({ id: "luftbild", selectedLayerId: "trueOrtho2024" }),
      layerMap,
      namedLayers
    );
    expect(result).toEqual({
      layers: [
        {
          id: "background:trueOrtho2024",
          title: "True Orthofoto 03/24",
          visible: true,
          opacity: 1,
          layerType: "wmts",
          props: {
            url: "https://maps.wuppertal.de/karten",
            name: "R102:trueortho2024",
          },
        },
        overlay,
      ],
    });
  });

  it("makes a vector base map a style row with the base map's opacity", () => {
    const result = backgroundAsLayers(
      configWith({
        id: "karte",
        selectedLayerId: "stadtplanOhneSchrift",
        opacity: 0.5,
      }),
      layerMap,
      namedLayers
    );
    expect(result.layers[0]).toEqual({
      id: "background:stadtplan_ohne_schrift",
      title: "Stadtplan (ohne Schrift)",
      visible: true,
      opacity: 0.5,
      layerType: "vector",
      props: {
        style: "https://tiles.cismet.de/stadtplan/ohne_schrift.style.json",
      },
    });
  });

  it("adds nothing for a hidden base map, and still drops the choice", () => {
    const result = backgroundAsLayers(
      configWith({
        id: "luftbild",
        selectedLayerId: "trueOrtho2024",
        visible: false,
      }),
      layerMap,
      namedLayers
    );
    expect(result).toEqual({ layers: [overlay] });
  });

  it("drops a base map that is only switched off, naming no map", () => {
    const result = backgroundAsLayers(
      // what a stored configuration may say, though the type wants the entry
      configWith({ visible: false } as NonNullable<
        MappingConfig["backgroundLayer"]
      >),
      layerMap,
      namedLayers
    );
    expect(result).toEqual({ layers: [overlay] });
  });

  it("gives every part of a composed base map its own row, bottom first", () => {
    const result = backgroundAsLayers(
      configWith({
        id: "luftbild",
        selectedLayerId: "luftbildkarte",
        opacity: 0.8,
      }),
      {
        luftbildkarte: {
          title: "Luftbildkarte",
          layers: "trueOrtho2024@75|rvrGrundriss@100",
        },
      },
      namedLayers
    );
    expect(result.layers.map(({ id, title }) => ({ id, title }))).toEqual([
      {
        id: "background:trueOrtho2024",
        title: "Luftbildkarte (trueOrtho2024)",
      },
      {
        id: "background:rvrGrundriss",
        title: "Luftbildkarte (rvrGrundriss)",
      },
      overlay,
    ]);
    expect(result.layers[0].opacity).toBeCloseTo(0.6);
    expect(result.layers[1].opacity).toBeCloseTo(0.8);
  });

  it("falls back to the layer string the configuration carries", () => {
    const result = backgroundAsLayers(
      configWith({
        id: "luftbild",
        selectedLayerId: "fromAnotherRoute",
        title: "Orthofoto",
        layers: "trueOrtho2024@100",
      }),
      layerMap,
      namedLayers
    );
    expect(result.layers[0]).toMatchObject({
      id: "background:trueOrtho2024",
      title: "Orthofoto",
    });
  });

  it("keeps a row the layers have already where it is", () => {
    const own = { id: "background:trueOrtho2024", title: "mine", opacity: 0.3 };
    const config: MappingConfig = {
      layers: [overlay, own],
      backgroundLayer: { id: "luftbild", selectedLayerId: "trueOrtho2024" },
    };
    expect(backgroundAsLayers(config, layerMap, namedLayers)).toEqual({
      layers: [overlay, own],
    });
  });

  it("leaves out a part no row can draw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = backgroundAsLayers(
      configWith({ id: "luftbild", selectedLayerId: "mixed" }),
      { mixed: { title: "Gemischt", layers: "esri@100|trueOrtho2024@100" } },
      namedLayers
    );
    expect(result.layers.map(({ id }) => id)).toEqual([
      "background:trueOrtho2024",
      overlay.id,
    ]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("returns the configuration itself when nothing can be converted", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unknown = configWith({ id: "luftbild", selectedLayerId: "gone" });
    const tilesOnly = configWith({ id: "luftbild", selectedLayerId: "esri" });
    // what a stored configuration may say, though the type wants the entry
    const noChoice = configWith({ opacity: 0.5 } as NonNullable<
      MappingConfig["backgroundLayer"]
    >);
    const noBackground: MappingConfig = { layers: [overlay] };
    expect(backgroundAsLayers(unknown, layerMap, namedLayers)).toBe(unknown);
    expect(
      backgroundAsLayers(
        tilesOnly,
        { esri: { title: "ESRI", layers: "esri@100" } },
        namedLayers
      )
    ).toBe(tilesOnly);
    expect(backgroundAsLayers(noChoice, layerMap, namedLayers)).toBe(noChoice);
    expect(backgroundAsLayers(noBackground, layerMap, namedLayers)).toBe(
      noBackground
    );
    warn.mockRestore();
  });
});
