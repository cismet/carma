import {
  groundToMercator,
  highlightButtons,
  highlightRing,
  highlightSpotsOf,
  isHighlightSpots,
  isShowHighlight,
  lngLatToMercator,
  mercatorToLngLat,
  sceneHighlights,
  type ShowHighlight,
} from "./highlights";

// the middle of the zoo model, `SHADOW_TEXTURE_LOCATION`
const ZOO: readonly [number, number] = lngLatToMercator([7.112016, 51.245446]);

const highlight = (id: string, title = id): ShowHighlight => ({
  id,
  title,
  center: ZOO,
  radiusMeters: 80,
  dim: 0.75,
});

describe("isShowHighlight", () => {
  it("takes a complete highlight", () => {
    expect(isShowHighlight(highlight("a"))).toBe(true);
  });

  it("refuses missing titles, broken centres and dims outside 0..1", () => {
    const untitled = { id: "a", center: ZOO, radiusMeters: 80, dim: 0.75 };
    expect(isShowHighlight(untitled)).toBe(false);
    expect(isShowHighlight({ ...highlight("a"), center: [1] })).toBe(false);
    expect(
      isShowHighlight({ ...highlight("a"), center: [Number.NaN, 0] })
    ).toBe(false);
    expect(isShowHighlight({ ...highlight("a"), dim: 1.5 })).toBe(false);
    expect(isShowHighlight({ ...highlight("a"), radiusMeters: 0 })).toBe(
      false
    );
  });
});

describe("sceneHighlights", () => {
  it("drops broken entries instead of failing the scene", () => {
    expect(
      sceneHighlights({ highlights: [highlight("a"), { id: "b" }] }).map(
        ({ id }) => id
      )
    ).toEqual(["a"]);
    expect(sceneHighlights({})).toEqual([]);
    expect(sceneHighlights({ highlights: "nope" })).toEqual([]);
  });
});

describe("highlightButtons", () => {
  it("gives highlights of the same name one button, in first-seen order", () => {
    expect(
      highlightButtons([
        highlight("a", "Punkt 1"),
        highlight("b", "Punkt 3"),
        highlight("c", " Punkt 1 "),
      ])
    ).toEqual([
      { key: "a", title: "Punkt 1", ids: ["a", "c"] },
      { key: "b", title: "Punkt 3", ids: ["b"] },
    ]);
  });

  it("keeps a button for each unnamed highlight", () => {
    expect(
      highlightButtons([highlight("a", ""), highlight("b", "  ")]).map(
        ({ ids }) => ids
      )
    ).toEqual([["a"], ["b"]]);
  });
});

describe("highlightSpotsOf", () => {
  it("keeps the scene's order and leaves the titles out", () => {
    const spots = highlightSpotsOf(
      [highlight("a"), highlight("b"), highlight("c")],
      ["c", "a"]
    );
    expect(spots.map(({ id }) => id)).toEqual(["a", "c"]);
    expect(spots[0]).not.toHaveProperty("title");
    expect(isHighlightSpots(spots)).toBe(true);
  });

  it("gives nothing when nothing is on", () => {
    expect(highlightSpotsOf([highlight("a")], [])).toEqual([]);
  });
});

describe("mercator conversion", () => {
  it("goes there and back", () => {
    const [lng, lat] = mercatorToLngLat(lngLatToMercator([7.1, 51.24]));
    expect(lng).toBeCloseTo(7.1, 9);
    expect(lat).toBeCloseTo(51.24, 9);
  });

  it("stretches ground distances by 1 / cos(latitude)", () => {
    expect(groundToMercator(100, ZOO)).toBeCloseTo(
      100 / Math.cos((51.245446 * Math.PI) / 180),
      6
    );
  });
});

describe("highlightRing", () => {
  it("is closed and lies the radius away on the ground", () => {
    const ring = highlightRing({ center: ZOO, radiusMeters: 100 }, 16);
    expect(ring).toHaveLength(17);
    expect(ring[0][0]).toBeCloseTo(ring[16][0], 9);
    expect(ring[0][1]).toBeCloseTo(ring[16][1], 9);
    // the east point: 100 m east of the middle, measured on the ground
    const [lng] = ring[0];
    const metersPerDegree =
      111_320 * Math.cos((51.245446 * Math.PI) / 180);
    expect((lng - 7.112016) * metersPerDegree).toBeCloseTo(100, 0);
  });
});
