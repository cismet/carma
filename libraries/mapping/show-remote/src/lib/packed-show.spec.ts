import {
  PACKED_SHOW_FORMAT,
  isPackedShow,
  packShow,
  storedShowByteSize,
  unpackStored,
} from "./packed-show";
import { SHOW_FORMAT, SHOW_VERSION, type Show } from "./show";

const layer = (index: number) => ({
  id: `custom:https://tiles.example.org/style-${index}.json`,
  title: `Ebene ${index}`,
  description: "Stadtplan ohne Schrift und Symbole, als Hintergrund.",
  other: { keywords: ["carmaConf://vectorStyle:https://tiles.example.org"] },
});

const showOf = (sceneCount: number): Show => ({
  format: SHOW_FORMAT,
  version: SHOW_VERSION,
  title: "Show",
  publishedAt: "2026-09-29T00:00:00.000Z",
  scenes: Array.from({ length: sceneCount }, (_, index) => ({
    id: `s${index}`,
    title: `Szene ${index}`,
    config: { layers: [layer(1), layer(2), layer(3)] },
  })) as Show["scenes"],
});

describe("packShow / unpackStored", () => {
  it("gives back the show it packed", async () => {
    const show = showOf(3);
    const packed = await packShow(show);
    expect(packed.format).toBe(PACKED_SHOW_FORMAT);
    expect(isPackedShow(packed)).toBe(true);
    expect(await unpackStored(packed)).toEqual(show);
  });

  it("keeps text outside ASCII", async () => {
    const show = { ...showOf(1), title: "Grünflächen – Überflutung „Zoo“" };
    expect(await unpackStored(await packShow(show))).toEqual(show);
  });

  it("passes a plain show from before packing through as it is", async () => {
    const show = showOf(2);
    expect(await unpackStored(show)).toBe(show);
  });

  it("rejects packed data that is not gzip", async () => {
    await expect(
      unpackStored({
        format: PACKED_SHOW_FORMAT,
        version: 1,
        data: "bm90IGd6aXA=",
      })
    ).rejects.toThrow();
  });
});

describe("isPackedShow", () => {
  it("rejects a plain show and envelopes of another version or without data", () => {
    expect(isPackedShow(showOf(1))).toBe(false);
    expect(
      isPackedShow({ format: PACKED_SHOW_FORMAT, version: 2, data: "" })
    ).toBe(false);
    expect(isPackedShow({ format: PACKED_SHOW_FORMAT, version: 1 })).toBe(
      false
    );
  });
});

describe("storedShowByteSize", () => {
  it("is the size of the packed body a publish sends", async () => {
    const show = showOf(4);
    const body = JSON.stringify(await packShow(show));
    expect(await storedShowByteSize(show)).toBe(
      new TextEncoder().encode(body).length
    );
  });

  it("is a fraction of the plain size for scenes that repeat their layers", async () => {
    const show = showOf(40);
    const plain = new TextEncoder().encode(JSON.stringify(show)).length;
    expect(await storedShowByteSize(show)).toBeLessThan(plain / 5);
  });
});
