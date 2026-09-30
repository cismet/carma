import { describe, expect, it } from "vitest";

import { DEFAULT_HIGHLIGHT_DIM } from "@carma-mapping/show-remote";

import {
  EMPTY_SPOT_CONTENT,
  SPOT_HIGHLIGHTS_LAYER,
  SPOT_HIGHLIGHTS_LAYER_ID,
  spotLayerContent,
  spotLayerFromHighlights,
  spotLayerHighlights,
  withSpotLayerContent,
  type Spot,
} from "./spot-layer";

const spot: Spot = {
  id: "h1",
  title: "Zoo",
  center: [791700, 6664800],
  radiusMeters: 80,
};

/** a row whose spot entry carries `config` as it is, unchecked */
const rowWithConfig = (config: unknown) => ({
  ...SPOT_HIGHLIGHTS_LAYER,
  tools: [{ addon: "spotHighlights", config }],
});

describe("spotLayerContent", () => {
  it("reads back what withSpotLayerContent wrote", () => {
    const content = { spots: [spot, { ...spot, id: "h2" }], dim: 0.5 };
    expect(
      spotLayerContent(withSpotLayerContent(SPOT_HIGHLIGHTS_LAYER, content))
    ).toEqual(content);
  });

  it("gives no spots for a row without a spot entry", () => {
    expect(spotLayerContent(SPOT_HIGHLIGHTS_LAYER)).toEqual(EMPTY_SPOT_CONTENT);
    expect(spotLayerContent({ tools: ["alwaysOnTop"] })).toEqual(
      EMPTY_SPOT_CONTENT
    );
  });

  it("drops a broken spot and keeps the others", () => {
    const row = rowWithConfig({
      spots: [spot, { id: "h2" }, { ...spot, id: "h3", radiusMeters: -1 }],
      dim: 0.5,
    });
    expect(spotLayerContent(row).spots).toEqual([spot]);
  });

  it("falls back to the default dim when it is missing or not a number", () => {
    for (const dim of [undefined, "0.5", Number.NaN, Infinity]) {
      expect(spotLayerContent(rowWithConfig({ spots: [], dim })).dim).toBe(
        DEFAULT_HIGHLIGHT_DIM
      );
    }
  });

  it("clamps the dim to the range the wheel allows", () => {
    expect(spotLayerContent(rowWithConfig({ spots: [], dim: 2 })).dim).toBe(
      0.95
    );
    expect(spotLayerContent(rowWithConfig({ spots: [], dim: 0 })).dim).toBe(
      0.2
    );
  });
});

describe("withSpotLayerContent", () => {
  it("replaces the spot entry and keeps every other tools entry", () => {
    const row = {
      ...SPOT_HIGHLIGHTS_LAYER,
      tools: [
        "alwaysOnTop",
        { addon: "spotHighlights", config: { spots: [spot], dim: 0.4 } },
        { kind: "flowField", config: {} },
      ],
    };
    const content = { spots: [], dim: 0.6 };
    expect(withSpotLayerContent(row, content).tools).toEqual([
      "alwaysOnTop",
      { kind: "flowField", config: {} },
      { addon: "spotHighlights", config: content },
    ]);
  });

  it("leaves the row it was given alone", () => {
    const row = { ...SPOT_HIGHLIGHTS_LAYER, tools: ["alwaysOnTop"] };
    withSpotLayerContent(row, { spots: [spot], dim: 0.5 });
    expect(row.tools).toEqual(["alwaysOnTop"]);
  });
});

describe("spotLayerHighlights", () => {
  it("gives every spot the layer's dim", () => {
    const other = { ...spot, id: "h2", title: "Punkt 2" };
    const row = withSpotLayerContent(SPOT_HIGHLIGHTS_LAYER, {
      spots: [spot, other],
      dim: 0.4,
    });
    expect(spotLayerHighlights(row)).toEqual([
      { ...spot, dim: 0.4 },
      { ...other, dim: 0.4 },
    ]);
  });
});

describe("spotLayerFromHighlights", () => {
  it("takes the darkest dim for all spots", () => {
    const row = spotLayerFromHighlights([
      { ...spot, dim: 0.3 },
      { ...spot, id: "h2", dim: 0.8 },
    ]);
    expect(row.id).toBe(SPOT_HIGHLIGHTS_LAYER_ID);
    expect(spotLayerContent(row)).toEqual({
      spots: [spot, { ...spot, id: "h2" }],
      dim: 0.8,
    });
  });

  it("uses the default dim for an empty list", () => {
    expect(spotLayerContent(spotLayerFromHighlights([]))).toEqual(
      EMPTY_SPOT_CONTENT
    );
  });
});
