import { describe, it, expect } from "vitest";
import { type Degrees, type Radians } from "@carma/types";
import { degToRad, radToDeg, PI, PI_OVER_TWO } from "@carma-commons/math";
import {
  CardinalDirectionEnum,
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
} from "./orientationUtils";

const DEG_MINUS_90 = -90 as Degrees;
const DEG_MINUS_44 = -44 as Degrees;
const DEG_44 = 44 as Degrees;
const DEG_45 = 45 as Degrees;
const DEG_46 = 46 as Degrees;
const DEG_90 = 90 as Degrees;
const DEG_134 = 134 as Degrees;
const DEG_135 = 135 as Degrees;
const DEG_180 = 180 as Degrees;
const DEG_224 = 224 as Degrees;
const DEG_225 = 225 as Degrees;
const DEG_226 = 226 as Degrees;
const DEG_270 = 270 as Degrees;
const DEG_314 = 314 as Degrees;
const DEG_315 = 315 as Degrees;
const DEG_360 = 360 as Degrees;

describe("getCardinalDirectionFromHeading", () => {
  // Cardinal direction boundaries in radians
  const NORTH_CENTER = 0;
  const EAST_CENTER = PI_OVER_TWO;
  const SOUTH_CENTER = PI;
  const WEST_CENTER = PI_OVER_TWO * 3;

  it("should return NORTH for headings centered at 0", () => {
    // North quadrant center
    expect(getCardinalDirectionFromHeading(NORTH_CENTER)).toBe(
      CardinalDirectionEnum.North
    );

    // North quadrant boundaries
    expect(getCardinalDirectionFromHeading(degToRad(DEG_MINUS_44))).toBe(
      CardinalDirectionEnum.North
    );
    expect(getCardinalDirectionFromHeading(degToRad(DEG_44))).toBe(
      CardinalDirectionEnum.North
    );
  });

  it("should return EAST for headings centered at PI/2", () => {
    // East quadrant center
    expect(getCardinalDirectionFromHeading(EAST_CENTER)).toBe(
      CardinalDirectionEnum.East
    );

    // East quadrant boundaries
    expect(getCardinalDirectionFromHeading(degToRad(DEG_46))).toBe(
      CardinalDirectionEnum.East
    );
    expect(getCardinalDirectionFromHeading(degToRad(DEG_134))).toBe(
      CardinalDirectionEnum.East
    );
  });

  it("should return SOUTH for headings centered at PI", () => {
    // South quadrant center
    expect(getCardinalDirectionFromHeading(SOUTH_CENTER)).toBe(
      CardinalDirectionEnum.South
    );

    // South quadrant boundaries
    expect(getCardinalDirectionFromHeading(degToRad(DEG_134))).toBe(
      CardinalDirectionEnum.South
    );
    expect(getCardinalDirectionFromHeading(degToRad(DEG_224))).toBe(
      CardinalDirectionEnum.South
    );
  });

  it("should return WEST for headings centered at 3PI/2", () => {
    // West quadrant center
    expect(getCardinalDirectionFromHeading(WEST_CENTER)).toBe(
      CardinalDirectionEnum.West
    );

    // West quadrant boundaries
    expect(getCardinalDirectionFromHeading(degToRad(DEG_226))).toBe(
      CardinalDirectionEnum.West
    );
    expect(getCardinalDirectionFromHeading(degToRad(DEG_314))).toBe(
      CardinalDirectionEnum.West
    );
  });

  it("should handle full circle wrapping", () => {
    // 360° should be equivalent to 0° (North)
    expect(getCardinalDirectionFromHeading(degToRad(DEG_360))).toBe(
      CardinalDirectionEnum.North
    );
    // Negative angles should wrap properly
    expect(getCardinalDirectionFromHeading(degToRad(DEG_MINUS_90))).toBe(
      CardinalDirectionEnum.West
    );
  });

  it("should handle boundaries between directions", () => {
    expect(getCardinalDirectionFromHeading(degToRad(DEG_45))).toBe(
      CardinalDirectionEnum.East
    );
    expect(getCardinalDirectionFromHeading(degToRad(DEG_135))).toBe(
      CardinalDirectionEnum.South
    );
    expect(getCardinalDirectionFromHeading(degToRad(DEG_225))).toBe(
      CardinalDirectionEnum.West
    );
    expect(getCardinalDirectionFromHeading(degToRad(DEG_315))).toBe(
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
    expect(+radToDeg(heading as Radians)).toBeCloseTo(0);
  });

  it("should convert EAST to π/2 radians (90 degrees)", () => {
    const heading = getHeadingFromCardinalDirection(CardinalDirectionEnum.East);
    expect(heading).toBeCloseTo(PI_OVER_TWO);
    expect(+radToDeg(heading as Radians)).toBeCloseTo(+DEG_90);
  });

  it("should convert SOUTH to π radians (180 degrees)", () => {
    const heading = getHeadingFromCardinalDirection(
      CardinalDirectionEnum.South
    );
    expect(heading).toBeCloseTo(PI);
    expect(+radToDeg(heading as Radians)).toBeCloseTo(+DEG_180);
  });

  it("should convert WEST to 3π/2 radians (270 degrees)", () => {
    const heading = getHeadingFromCardinalDirection(CardinalDirectionEnum.West);
    expect(heading).toBeCloseTo(3 * PI_OVER_TWO);
    expect(+radToDeg(heading as Radians)).toBeCloseTo(+DEG_270);
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
