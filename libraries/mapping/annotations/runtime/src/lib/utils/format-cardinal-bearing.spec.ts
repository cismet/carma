import { degToRadNumeric, PI_OVER_FOUR } from "@carma-units";
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

  it("supports sixteen-point German compass headings", () => {
    const options = { form: CARDINAL_BEARING_FORM.SHORT, points: 16 } as const;
    expect(formatCardinalBearing(degToRadNumeric(22.5), options)).toBe("NNO");
    expect(formatCardinalBearing(degToRadNumeric(67.5), options)).toBe("ONO");
    expect(formatCardinalBearing(degToRadNumeric(320), options)).toBe("NW");
    expect(formatCardinalBearing(degToRadNumeric(337.5), options)).toBe("NNW");
    expect(formatCardinalBearing(degToRadNumeric(-22.5), options)).toBe("NNW");
    expect(formatCardinalBearing(degToRadNumeric(360), options)).toBe("N");
  });

  it("rounds at the half-sector boundary in sixteen-point mode", () => {
    const options = { form: CARDINAL_BEARING_FORM.SHORT, points: 16 } as const;
    expect(formatCardinalBearing(degToRadNumeric(11.24), options)).toBe("N");
    expect(formatCardinalBearing(degToRadNumeric(11.25), options)).toBe("NNO");
    expect(formatCardinalBearing(degToRadNumeric(348.75), options)).toBe("N");
  });

  it("supports English intermediate directions without changing the default", () => {
    expect(
      formatCardinalBearing(degToRadNumeric(22.5), {
        locale: CARDINAL_BEARING_LOCALE.EN,
        form: CARDINAL_BEARING_FORM.SHORT,
        points: 16,
      })
    ).toBe("NNE");
    expect(formatCardinalBearing(degToRadNumeric(22.5))).toBe("Nordost");
  });
});
