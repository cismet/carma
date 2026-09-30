import {
  degToRadNumeric as degToRad,
  radToDegNumeric as radToDeg,
  PI,
  PI_OVER_TWO,
} from "@carma-units";
import { describe, expect, it } from "vitest";

import {
  CardinalDirectionEnum,
  findClosestCardinalIndex,
  getCardinalDirectionFromHeading,
  getCardinalHeadings,
  getHeadingFromCardinalDirection,
  headingRelativeSlots,
  rotateCardinal,
} from "./orientation";

describe("getCardinalDirectionFromHeading", () => {
  it("returns NORTH for headings centred at 0", () => {
    expect(getCardinalDirectionFromHeading(0)).toBe(
      CardinalDirectionEnum.North
    );
    expect(getCardinalDirectionFromHeading(degToRad(-44))).toBe(
      CardinalDirectionEnum.North
    );
    expect(getCardinalDirectionFromHeading(degToRad(44))).toBe(
      CardinalDirectionEnum.North
    );
  });

  it("returns EAST for headings centred at PI/2", () => {
    expect(getCardinalDirectionFromHeading(PI_OVER_TWO)).toBe(
      CardinalDirectionEnum.East
    );
    expect(getCardinalDirectionFromHeading(degToRad(46))).toBe(
      CardinalDirectionEnum.East
    );
    expect(getCardinalDirectionFromHeading(degToRad(134))).toBe(
      CardinalDirectionEnum.East
    );
  });

  it("returns SOUTH for headings centred at PI", () => {
    expect(getCardinalDirectionFromHeading(PI)).toBe(
      CardinalDirectionEnum.South
    );
    expect(getCardinalDirectionFromHeading(degToRad(136))).toBe(
      CardinalDirectionEnum.South
    );
    expect(getCardinalDirectionFromHeading(degToRad(224))).toBe(
      CardinalDirectionEnum.South
    );
  });

  it("returns WEST for headings centred at 3PI/2", () => {
    expect(getCardinalDirectionFromHeading(PI_OVER_TWO * 3)).toBe(
      CardinalDirectionEnum.West
    );
    expect(getCardinalDirectionFromHeading(degToRad(226))).toBe(
      CardinalDirectionEnum.West
    );
    expect(getCardinalDirectionFromHeading(degToRad(314))).toBe(
      CardinalDirectionEnum.West
    );
  });

  it("wraps around the full circle", () => {
    expect(getCardinalDirectionFromHeading(degToRad(360))).toBe(
      CardinalDirectionEnum.North
    );
    expect(getCardinalDirectionFromHeading(degToRad(-90))).toBe(
      CardinalDirectionEnum.West
    );
  });

  it("assigns the boundaries to the next sector", () => {
    expect(getCardinalDirectionFromHeading(degToRad(45))).toBe(
      CardinalDirectionEnum.East
    );
    expect(getCardinalDirectionFromHeading(degToRad(135))).toBe(
      CardinalDirectionEnum.South
    );
    expect(getCardinalDirectionFromHeading(degToRad(225))).toBe(
      CardinalDirectionEnum.West
    );
    expect(getCardinalDirectionFromHeading(degToRad(315))).toBe(
      CardinalDirectionEnum.North
    );
  });
});

describe("getHeadingFromCardinalDirection", () => {
  it("maps the four sectors to 0, 90, 180 and 270 degrees", () => {
    expect(
      radToDeg(getHeadingFromCardinalDirection(CardinalDirectionEnum.North))
    ).toBeCloseTo(0);
    expect(
      radToDeg(getHeadingFromCardinalDirection(CardinalDirectionEnum.East))
    ).toBeCloseTo(90);
    expect(
      radToDeg(getHeadingFromCardinalDirection(CardinalDirectionEnum.South))
    ).toBeCloseTo(180);
    expect(
      radToDeg(getHeadingFromCardinalDirection(CardinalDirectionEnum.West))
    ).toBeCloseTo(270);
  });

  it("round-trips through getCardinalDirectionFromHeading", () => {
    for (const direction of [
      CardinalDirectionEnum.North,
      CardinalDirectionEnum.East,
      CardinalDirectionEnum.South,
      CardinalDirectionEnum.West,
    ]) {
      expect(
        getCardinalDirectionFromHeading(
          getHeadingFromCardinalDirection(direction)
        )
      ).toBe(direction);
    }
  });
});

describe("getCardinalHeadings and findClosestCardinalIndex", () => {
  it("offsets every sector by the flight's rotation", () => {
    const headings = getCardinalHeadings(degToRad(-34.3));
    expect(radToDeg(headings[CardinalDirectionEnum.North])).toBeCloseTo(325.7);
    expect(radToDeg(headings[CardinalDirectionEnum.East])).toBeCloseTo(55.7);
  });

  it("finds the closest offset sector across the wrap", () => {
    const headings = getCardinalHeadings(degToRad(-34.3));
    expect(findClosestCardinalIndex(degToRad(-10), headings)).toBe(
      CardinalDirectionEnum.North
    );
    expect(findClosestCardinalIndex(degToRad(60), headings)).toBe(
      CardinalDirectionEnum.East
    );
    expect(findClosestCardinalIndex(degToRad(350), headings)).toBe(
      CardinalDirectionEnum.North
    );
  });
});

describe("rotateCardinal and headingRelativeSlots", () => {
  it("steps the sector index against the compass when turning clockwise", () => {
    expect(rotateCardinal(CardinalDirectionEnum.North, true)).toBe(
      CardinalDirectionEnum.West
    );
    expect(rotateCardinal(CardinalDirectionEnum.North, false)).toBe(
      CardinalDirectionEnum.East
    );
    expect(rotateCardinal(CardinalDirectionEnum.West, true)).toBe(
      CardinalDirectionEnum.South
    );
  });

  it("puts the active sector on top", () => {
    const slots = headingRelativeSlots(CardinalDirectionEnum.East);
    expect(slots.topDir).toBe(CardinalDirectionEnum.East);
    expect(slots.rightDir).toBe(CardinalDirectionEnum.South);
    expect(slots.bottomDir).toBe(CardinalDirectionEnum.West);
    expect(slots.leftDir).toBe(CardinalDirectionEnum.North);
  });
});
