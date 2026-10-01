import { describe, expect, it } from "vitest";
import { terrainIndexArraysEqual } from "./terrain-index-equality";

describe("terrain index array equality", () => {
  it.each([
    [new Uint16Array([0, 1, 2]), new Uint16Array([0, 1, 2]), true],
    [new Uint16Array([0, 1, 2]), new Uint32Array([0, 1, 2]), false],
    [new Uint32Array([0, 1, 2]), new Uint32Array([0, 2, 1]), false],
    [new Uint32Array([0, 1, 2]), new Uint32Array([0, 1]), false],
  ] as const)(
    "checks array type, length and winding",
    (left, right, expected) => {
      expect(terrainIndexArraysEqual(left, right)).toBe(expected);
    }
  );
});
