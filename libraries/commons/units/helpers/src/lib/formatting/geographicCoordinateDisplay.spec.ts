import { describe, expect, it } from "vitest";
import type { Degrees } from "@carma/units/types";
import {
  GEOGRAPHIC_DIRECTION_STYLE,
  formatLatLonDegrees,
  formatLatitudeDegrees,
  formatLongitudeDegrees,
} from "./geographicCoordinateDisplay";

describe("geographic degree formatters", () => {
  it("formats latitude and longitude with international cardinals", () => {
    expect(
      formatLatitudeDegrees(51.25609 as Degrees, { locale: "en-US" })
    ).toBe("51.25609°N");
    expect(
      formatLongitudeDegrees(-7.1761 as Degrees, { locale: "en-US" })
    ).toBe("7.1761°W");
  });

  it("uses german east label based on locale", () => {
    expect(formatLongitudeDegrees(7.1761 as Degrees, { locale: "de-DE" })).toBe(
      "7,1761°O"
    );
  });

  it("formats signed decimal degrees without cardinals", () => {
    expect(
      formatLongitudeDegrees(-13 as Degrees, {
        locale: "en-US",
        fractionDigits: 0,
        directionStyle: GEOGRAPHIC_DIRECTION_STYLE.SIGNED,
      })
    ).toBe("-13°");
  });

  it("supports hiding or overriding the unit symbol", () => {
    expect(
      formatLatitudeDegrees(-51.25609 as Degrees, {
        locale: "en-US",
        unitSymbol: false,
        directionStyle: GEOGRAPHIC_DIRECTION_STYLE.SIGNED,
      })
    ).toBe("-51.25609");

    expect(
      formatLongitudeDegrees(7.1761 as Degrees, {
        locale: "en-US",
        unitSymbol: " deg ",
      })
    ).toBe("7.1761 deg E");
  });

  it("supports separate fraction digits for latitude and longitude", () => {
    const [latitude, longitude] = formatLatLonDegrees(
      51.25609 as Degrees,
      7.1761 as Degrees,
      {
        locale: "en-US",
        fractionDigits: { lat: 4, lon: 2 },
      }
    );

    expect(latitude).toBe("51.2561°N");
    expect(longitude).toBe("7.18°E");
  });

  it("trims trailing zeros instead of padding to fixed decimals", () => {
    expect(
      formatLongitudeDegrees(7.1 as Degrees, {
        locale: "en-US",
        fractionDigits: 6,
      })
    ).toBe("7.1°E");
  });

  it("returns unresolved for non-finite coordinates", () => {
    expect(formatLatitudeDegrees(Number.NaN as Degrees)).toBe("unresolved");
    expect(formatLongitudeDegrees(Number.POSITIVE_INFINITY as Degrees)).toBe(
      "unresolved"
    );
  });

  it("uses positive-side cardinals at zero in cardinal mode", () => {
    expect(
      formatLatitudeDegrees(0 as Degrees, {
        locale: "en-US",
        fractionDigits: 0,
      })
    ).toBe("0°N");
    expect(
      formatLongitudeDegrees(0 as Degrees, {
        locale: "en-US",
        fractionDigits: 0,
      })
    ).toBe("0°E");
  });

  it("formats zero without a sign in signed mode", () => {
    expect(
      formatLatitudeDegrees(0 as Degrees, {
        locale: "en-US",
        fractionDigits: 0,
        directionStyle: GEOGRAPHIC_DIRECTION_STYLE.SIGNED,
      })
    ).toBe("0°");
    expect(
      formatLongitudeDegrees(0 as Degrees, {
        locale: "en-US",
        fractionDigits: 0,
        directionStyle: GEOGRAPHIC_DIRECTION_STYLE.SIGNED,
      })
    ).toBe("0°");
  });
});
