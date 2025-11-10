import { describe, it, expect } from "vitest";
import { Math as CesiumMath } from "cesium";
import {
  CardinalDirectionEnum,
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
} from "./orientationUtils";

describe("getCardinalDirectionFromHeading", () => {
  // Cardinal direction boundaries in radians
  const NORTH_CENTER = 0;
  const EAST_CENTER = CesiumMath.PI_OVER_TWO;
  const SOUTH_CENTER = Math.PI;
  const WEST_CENTER = CesiumMath.PI_OVER_TWO * 3;

  it("should return NORTH for headings centered at 0", () => {
    // North quadrant center
    expect(getCardinalDirectionFromHeading(NORTH_CENTER)).toBe(
      CardinalDirectionEnum.North
    );

    // North quadrant boundaries
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(-44))).toBe(
      CardinalDirectionEnum.North
    );
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(44))).toBe(
      CardinalDirectionEnum.North
    );
  });

  it("should return EAST for headings centered at PI/2", () => {
    // East quadrant center
    expect(getCardinalDirectionFromHeading(EAST_CENTER)).toBe(
      CardinalDirectionEnum.East
    );

    // East quadrant boundaries
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(46))).toBe(
      CardinalDirectionEnum.East
    );
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(134))).toBe(
      CardinalDirectionEnum.East
    );
  });

  it("should return SOUTH for headings centered at PI", () => {
    // South quadrant center
    expect(getCardinalDirectionFromHeading(SOUTH_CENTER)).toBe(
      CardinalDirectionEnum.South
    );

    // South quadrant boundaries
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(136))).toBe(
      CardinalDirectionEnum.South
    );
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(224))).toBe(
      CardinalDirectionEnum.South
    );
  });

  it("should return WEST for headings centered at 3PI/2", () => {
    // West quadrant center
    expect(getCardinalDirectionFromHeading(WEST_CENTER)).toBe(
      CardinalDirectionEnum.West
    );

    // West quadrant boundaries
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(226))).toBe(
      CardinalDirectionEnum.West
    );
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(314))).toBe(
      CardinalDirectionEnum.West
    );
  });

  it("should handle full circle wrapping", () => {
    // 360° should be equivalent to 0° (North)
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(360))).toBe(
      CardinalDirectionEnum.North
    );
    // Negative angles should wrap properly
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(-90))).toBe(
      CardinalDirectionEnum.West
    );
  });

  it("should handle boundaries between directions", () => {
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(45))).toBe(
      CardinalDirectionEnum.East
    );
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(135))).toBe(
      CardinalDirectionEnum.South
    );
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(225))).toBe(
      CardinalDirectionEnum.West
    );
    expect(getCardinalDirectionFromHeading(CesiumMath.toRadians(315))).toBe(
      CardinalDirectionEnum.North
    );
  });
});

describe("getHeadingFromCardinalDirection", () => {
  it("should convert NORTH to 0 radians", () => {
    const heading = getHeadingFromCardinalDirection(
      CardinalDirectionEnum.North
    );
    expect(heading).toBeCloseTo(0);
    expect(CesiumMath.toDegrees(heading)).toBeCloseTo(0);
  });

  it("should convert EAST to π/2 radians (90 degrees)", () => {
    const heading = getHeadingFromCardinalDirection(CardinalDirectionEnum.East);
    expect(heading).toBeCloseTo(CesiumMath.PI_OVER_TWO);
    expect(CesiumMath.toDegrees(heading)).toBeCloseTo(90);
  });

  it("should convert SOUTH to π radians (180 degrees)", () => {
    const heading = getHeadingFromCardinalDirection(
      CardinalDirectionEnum.South
    );
    expect(heading).toBeCloseTo(Math.PI);
    expect(CesiumMath.toDegrees(heading)).toBeCloseTo(180);
  });

  it("should convert WEST to 3π/2 radians (270 degrees)", () => {
    const heading = getHeadingFromCardinalDirection(CardinalDirectionEnum.West);
    expect(heading).toBeCloseTo(3 * CesiumMath.PI_OVER_TWO);
    expect(CesiumMath.toDegrees(heading)).toBeCloseTo(270);
  });

  it("should produce headings that, when converted back, return the original cardinal direction", () => {
    // Test the full circle of conversions
    const directions = [
      CardinalDirectionEnum.North,
      CardinalDirectionEnum.East,
      CardinalDirectionEnum.South,
      CardinalDirectionEnum.West,
    ];

    directions.forEach((direction) => {
      const heading = getHeadingFromCardinalDirection(direction);
      const resultDirection = getCardinalDirectionFromHeading(heading);
      expect(resultDirection).toBe(direction);
    });
  });
});
