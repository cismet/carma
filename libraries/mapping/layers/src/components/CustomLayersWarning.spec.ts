import { describe, expect, it } from "vitest";

import type { Layer, LayerStackEntry } from "../lib/contracts/carma-layers.d";
import { getCustomLayers } from "./CustomLayersWarning";

const layerOf = (id: string, serviceName: string) =>
  ({ id, title: id, other: { serviceName } }) as unknown as Layer;

describe("getCustomLayers", () => {
  it("finds the dropped layers, also inside a group", () => {
    const stack = [
      layerOf("wuppPlanung:kwp_waermenetz", "wuppPlanung"),
      layerOf("custom:https://tiles.cismet.de/kwp/style.json", "custom"),
      {
        type: "group",
        id: "group",
        title: "Gruppe",
        layers: [
          layerOf("wuppKarten:expg", "wuppKarten"),
          layerOf("custom:dropped.json", "custom"),
        ],
      },
    ] as unknown as LayerStackEntry[];

    expect(getCustomLayers(stack).map((layer) => layer.id)).toEqual([
      "custom:https://tiles.cismet.de/kwp/style.json",
      "custom:dropped.json",
    ]);
  });

  it("finds nothing in a stack built from the catalog", () => {
    const stack = [layerOf("wuppKarten:expg", "wuppKarten")];

    expect(getCustomLayers(stack)).toEqual([]);
  });
});
