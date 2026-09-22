import { isBounds3857 } from "./bounds";
import { SHOW_FORMAT, SHOW_VERSION, isShow } from "./show";

const showWith = (scene: Record<string, unknown>) => ({
  format: SHOW_FORMAT,
  version: SHOW_VERSION,
  title: "Show",
  publishedAt: "2026-09-22T00:00:00.000Z",
  scenes: [{ id: "s1", title: "Szene 1", config: { layers: [] }, ...scene }],
});

describe("isBounds3857", () => {
  it("takes four ordered EPSG:3857 numbers", () => {
    expect(isBounds3857([788836.855, 6663227.421, 794575.246, 6666423.835])).toBe(
      true
    );
  });

  it("rejects swapped corners, wrong lengths and values off the projection", () => {
    expect(isBounds3857([2, 0, 1, 1])).toBe(false);
    expect(isBounds3857([0, 0, 1])).toBe(false);
    expect(isBounds3857([0, 0, 1, Number.NaN])).toBe(false);
    expect(isBounds3857([0, 0, 3e7, 1])).toBe(false);
    expect(isBounds3857("0,0,1,1")).toBe(false);
  });
});

describe("isShow", () => {
  it("accepts a scene without a position", () => {
    expect(isShow(showWith({}))).toBe(true);
  });

  it("accepts a scene with a position", () => {
    expect(isShow(showWith({ bounds: [0, 0, 1, 1] }))).toBe(true);
  });

  it("rejects a scene whose position is unusable", () => {
    expect(isShow(showWith({ bounds: [1, 0, 0, 1] }))).toBe(false);
  });
});
