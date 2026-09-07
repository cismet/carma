import { SearchAltitude, SearchHourAngle } from "astronomy-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDaylightWindow, type SolarSelection } from "./solar-position";

vi.mock("astronomy-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("astronomy-engine")>();
  return {
    ...actual,
    SearchAltitude: vi.fn(actual.SearchAltitude),
    SearchHourAngle: vi.fn(actual.SearchHourAngle),
  };
});

const location = { latitude: 51.256, longitude: 7.15 };
const selection: SolarSelection = {
  year: 2035,
  dayOfYear: 80,
  minutes: 660,
  timeZone: "Europe/Berlin",
};

describe("daylight window cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shares immutable day events across fresh objects and minute updates", () => {
    const first = getDaylightWindow(selection, location);
    for (let minute = 0; minute < 100; minute += 1) {
      const nextSelection = { ...selection, minutes: minute };
      expect(getDaylightWindow(nextSelection, { ...location })).toBe(first);
    }

    expect(Object.isFrozen(first)).toBe(true);
    expect(SearchAltitude).toHaveBeenCalledTimes(2);
    expect(SearchHourAngle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["year", { year: 2041 }, {}],
    ["day", { dayOfYear: 81 }, {}],
    ["time zone", { timeZone: "UTC" }, {}],
    ["latitude", {}, { latitude: location.latitude + 0.00000001 }],
    ["longitude", {}, { longitude: location.longitude + 0.00000001 }],
  ])(
    "recomputes when %s changes without coordinate rounding",
    (_, dateChange, locationChange) => {
      getDaylightWindow({ ...selection, year: 2040 }, location);
      vi.clearAllMocks();

      getDaylightWindow(
        { ...selection, year: 2040, ...dateChange },
        { ...location, ...locationChange }
      );

      expect(SearchAltitude).toHaveBeenCalledTimes(2);
      expect(SearchHourAngle).toHaveBeenCalledTimes(1);
    }
  );

  it("evicts the least recently used day after 64 exact input combinations", () => {
    const date = { ...selection, year: 2090 };
    for (let dayOfYear = 1; dayOfYear <= 64; dayOfYear += 1) {
      getDaylightWindow({ ...date, dayOfYear }, location);
    }
    const recent = getDaylightWindow({ ...date, dayOfYear: 1 }, location);
    getDaylightWindow({ ...date, dayOfYear: 65 }, location);
    vi.clearAllMocks();

    expect(getDaylightWindow({ ...date, dayOfYear: 1 }, location)).toBe(recent);
    expect(SearchAltitude).not.toHaveBeenCalled();
    getDaylightWindow({ ...date, dayOfYear: 2 }, location);
    expect(SearchAltitude).toHaveBeenCalledTimes(2);
    expect(SearchHourAngle).toHaveBeenCalledTimes(1);
  });
});
