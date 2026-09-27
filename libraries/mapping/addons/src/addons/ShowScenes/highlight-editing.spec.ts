import { lngLatToMercator, type ShowHighlight } from "@carma-mapping/show-remote";

import { highlightPreviewFeatures } from "./highlight-editing";

const highlight = (id: string, dim: number): ShowHighlight => ({
  id,
  title: id,
  center: lngLatToMercator([7.112, 51.245]),
  radiusMeters: 80,
  dim,
});

describe("highlightPreviewFeatures", () => {
  it("is empty without highlights", () => {
    expect(highlightPreviewFeatures([]).features).toEqual([]);
  });

  it("gives one cover with a hole per spot and one outline per spot", () => {
    const { features } = highlightPreviewFeatures([
      highlight("a", 0.5),
      highlight("b", 0.9),
    ]);
    const [cover, ...rings] = features;
    expect(cover.properties).toMatchObject({ kind: "cover" });
    // lighter than on the display, as dark as the strongest spot wants
    expect((cover.properties as { dim: number }).dim).toBeCloseTo(0.54, 6);
    expect(
      (cover.geometry as GeoJSON.Polygon).coordinates
    ).toHaveLength(3);
    expect(rings.map(({ properties }) => properties?.["id"])).toEqual([
      "a",
      "b",
    ]);
  });
});
