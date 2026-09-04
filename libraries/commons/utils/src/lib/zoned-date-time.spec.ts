import { describe, expect, it } from "vitest";

import {
  getZonedUtcOffsetMinutes,
  instantToZonedYearDayTime,
  zonedYearDayTimeToInstant,
} from "./zoned-date-time";

const BERLIN = "Europe/Berlin";

describe("zoned date time", () => {
  it("converts an instant to local civil time in its IANA time zone", () => {
    expect(
      instantToZonedYearDayTime(
        new Date("2026-06-21T10:00:00.000Z"),
        BERLIN
      )
    ).toEqual({
      year: 2026,
      dayOfYear: 172,
      minutes: 12 * 60,
      timeZone: BERLIN,
    });
  });

  it("uses the zone's daylight-saving offset for the selected date", () => {
    expect(
      getZonedUtcOffsetMinutes({
        year: 2026,
        dayOfYear: 15,
        minutes: 12 * 60,
        timeZone: BERLIN,
      })
    ).toBe(60);
    expect(
      getZonedUtcOffsetMinutes({
        year: 2026,
        dayOfYear: 172,
        minutes: 12 * 60,
        timeZone: BERLIN,
      })
    ).toBe(120);
  });

  it("applies Temporal-compatible DST disambiguation", () => {
    expect(
      zonedYearDayTimeToInstant({
        year: 2026,
        dayOfYear: 88,
        minutes: 2 * 60 + 30,
        timeZone: BERLIN,
      }).toISOString()
    ).toBe("2026-03-29T01:30:00.000Z");
    expect(
      zonedYearDayTimeToInstant({
        year: 2026,
        dayOfYear: 298,
        minutes: 2 * 60 + 30,
        timeZone: BERLIN,
      }).toISOString()
    ).toBe("2026-10-25T00:30:00.000Z");
  });
});
