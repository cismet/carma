import { describe, expect, it } from "vitest";
import { smoothstep } from "./smoothstep";

describe("smoothstep", () => {
  it.each([
    [-3, 1, -10, 0],
    [-3, 1, -3, 0],
    [-3, 1, -2, 0.15625],
    [-3, 1, -1, 0.5],
    [10, 20, 17.5, 0.84375],
    [10, 20, 20, 1],
    [10, 20, 25, 1],
  ])("maps [%s, %s] at %s to %s", (start, end, value, expected) => {
    expect(smoothstep(start, end, value)).toBe(expected);
  });
});
