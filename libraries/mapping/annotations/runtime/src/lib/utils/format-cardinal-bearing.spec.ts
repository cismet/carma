import { PI_OVER_FOUR } from "@carma-units";
import { describe, expect, it } from "vitest";
import {
  CARDINAL_BEARING_FORM,
  CARDINAL_BEARING_LOCALE,
  formatCardinalBearing,
} from "./format-cardinal-bearing";

describe("formatCardinalBearing", () => {
  it("formats long-form German labels by default", () => {
    expect(formatCardinalBearing(0)).toBe("Nord");
    expect(formatCardinalBearing(PI_OVER_FOUR)).toBe("Nordost");
  });

  it("supports short-form English labels", () => {
    expect(
      formatCardinalBearing(PI_OVER_FOUR, {
        locale: CARDINAL_BEARING_LOCALE.EN,
        form: CARDINAL_BEARING_FORM.SHORT,
      })
    ).toBe("NE");
  });

  it("normalizes wrapped negative bearings", () => {
    expect(formatCardinalBearing(-PI_OVER_FOUR)).toBe("Nordwest");
  });
});
