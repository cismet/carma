import { describe, expect, it } from "vitest";

import { findStyleSlot, placeAtSlot } from "./style-slot";

type FakeLayer = {
  id: string;
  type?: string;
  metadata?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

/** the four map calls the slot helpers use, over a plain layer list */
const fakeMap = (layers: FakeLayer[]) => {
  let order = layers.map((layer) => layer.id);
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  let moves = 0;
  return {
    getLayersOrder: () => [...order],
    getLayer: (id: string) => byId.get(id) as never,
    getPaintProperty: (id: string, name: string) =>
      byId.get(id)?.paint?.[name] as never,
    moveLayer: (id: string, beforeId?: string) => {
      moves += 1;
      order = order.filter((other) => other !== id);
      const at = beforeId ? order.indexOf(beforeId) : -1;
      if (at < 0) order.push(id);
      else order.splice(at, 0, id);
    },
    get moves() {
      return moves;
    },
  };
};

const placeholder = (
  id: string,
  carmaLayerId: string,
  opacity?: number
): FakeLayer => ({
  id,
  metadata: {
    carmaConf: { slot: "flowField" },
    "carma-layer-id": carmaLayerId,
    ...(opacity === undefined ? {} : { "layer-opacity": opacity }),
  },
});

describe("findStyleSlot", () => {
  it("finds the placeholder with the style's opacity", () => {
    const map = fakeMap([
      { id: "a-fill" },
      placeholder("b-flow", "b", 0.6),
      { id: "b-labels" },
    ]);
    expect(findStyleSlot(map, "flowField")).toEqual({
      placeholderId: "b-flow",
      opacity: 0.6,
    });
  });

  it("reads the opacity from the paint, which the style diff keeps current", () => {
    // the metadata still holds the opacity the layer was added with
    const map = fakeMap([
      {
        ...placeholder("b-flow", "b", 1),
        type: "background",
        paint: { "background-opacity": 0.4 },
      },
    ]);
    expect(findStyleSlot(map, "flowField")?.opacity).toBe(0.4);
  });

  it("takes the topmost placeholder, or the launching style's one", () => {
    const map = fakeMap([
      placeholder("a-flow", "a"),
      placeholder("b-flow", "b"),
    ]);
    expect(findStyleSlot(map, "flowField")?.placeholderId).toBe("b-flow");
    expect(findStyleSlot(map, "flowField", "a")?.placeholderId).toBe("a-flow");
  });

  it("finds nothing for another slot or a missing style", () => {
    const map = fakeMap([placeholder("a-flow", "a")]);
    expect(findStyleSlot(map, "vehicleAnimation")).toBeUndefined();
    expect(findStyleSlot(map, "flowField", "c")).toBeUndefined();
  });

  it("finds nothing while the map has no style", () => {
    const map = {
      getLayersOrder: () => {
        throw new Error("no style");
      },
      getLayer: () => undefined,
      getPaintProperty: () => undefined,
    };
    expect(findStyleSlot(map, "flowField")).toBeUndefined();
  });
});

describe("placeAtSlot", () => {
  it("puts the layers, in order, directly under the placeholder", () => {
    const map = fakeMap([
      { id: "fallback" },
      { id: "a-fill" },
      placeholder("b-flow", "b"),
      { id: "b-labels" },
      { id: "particles" },
    ]);
    placeAtSlot(map, ["fallback", "particles"], "b-flow");
    expect(map.getLayersOrder()).toEqual([
      "a-fill",
      "fallback",
      "particles",
      "b-flow",
      "b-labels",
    ]);
  });

  it("does not move what is already in place", () => {
    const map = fakeMap([
      { id: "a-fill" },
      { id: "particles" },
      placeholder("b-flow", "b"),
    ]);
    placeAtSlot(map, ["particles"], "b-flow");
    expect(map.moves).toBe(0);
  });

  it("skips layers that are not on the map", () => {
    const map = fakeMap([placeholder("b-flow", "b"), { id: "particles" }]);
    placeAtSlot(map, ["fallback", "particles"], "b-flow");
    expect(map.getLayersOrder()).toEqual(["particles", "b-flow"]);
  });

  it("moves nothing without a placeholder", () => {
    const map = fakeMap([{ id: "particles" }, { id: "a-fill" }]);
    placeAtSlot(map, ["particles"], undefined);
    placeAtSlot(map, ["particles"], "gone");
    expect(map.moves).toBe(0);
  });
});
