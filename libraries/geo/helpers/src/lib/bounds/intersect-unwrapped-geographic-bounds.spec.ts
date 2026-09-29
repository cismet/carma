import { describe, expect, it } from "vitest";
import { intersectUnwrappedGeographicBounds } from "./intersect-unwrapped-geographic-bounds";

describe("intersectUnwrappedGeographicBounds", () => {
  const bounds = { west: 7, south: 51, east: 8, north: 52 };

  it("clips both axes symmetrically", () => {
    const other = { west: 6, south: 51.5, east: 7.5, north: 53 };
    const expected = { west: 7, south: 51.5, east: 7.5, north: 52 };
    expect(intersectUnwrappedGeographicBounds(bounds, other)).toEqual(expected);
    expect(intersectUnwrappedGeographicBounds(other, bounds)).toEqual(expected);
    expect(intersectUnwrappedGeographicBounds(bounds, bounds)).toEqual(bounds);
  });

  it("requires positive area rather than edge contact", () => {
    expect(
      intersectUnwrappedGeographicBounds(bounds, {
        ...bounds,
        west: 8,
        east: 9,
      })
    ).toBeNull();
    expect(
      intersectUnwrappedGeographicBounds(bounds, {
        ...bounds,
        south: 53,
        north: 54,
      })
    ).toBeNull();
    expect(
      intersectUnwrappedGeographicBounds(bounds, { ...bounds, east: 7 })
    ).toBeNull();
  });

  it("keeps the caller's unwrapped longitude frame", () => {
    const first = { west: 170, south: 0, east: 190, north: 10 };
    expect(
      intersectUnwrappedGeographicBounds(first, {
        ...first,
        west: 175,
        east: 185,
      })
    ).toEqual({ ...first, west: 175, east: 185 });
    expect(
      intersectUnwrappedGeographicBounds(first, {
        ...first,
        west: -185,
        east: -175,
      })
    ).toBeNull();
  });

  it.each([
    { ...bounds, west: 170, east: -170 },
    { ...bounds, south: 53 },
    { ...bounds, west: Number.NaN },
    { ...bounds, north: Number.POSITIVE_INFINITY },
  ])("rejects unordered or non-finite input on either side: %o", (invalid) => {
    expect(() => intersectUnwrappedGeographicBounds(bounds, invalid)).toThrow(
      RangeError
    );
    expect(() => intersectUnwrappedGeographicBounds(invalid, bounds)).toThrow(
      RangeError
    );
  });
});
