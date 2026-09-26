import type { MappingConfig } from "@carma-api";
// the display's solar maths, which the phone approximates
import {
  getDaylightWindow,
  getSolarPosition,
} from "@carma-mapping/shadow-simulation/core";

import {
  approximateDaylight,
  clampDayOfYear,
  clockShadowDate,
  findSceneShadow,
  initialShadowClock,
  initialShadowDate,
  isShadowControl,
  planShadowApply,
  SHADOW_START_BEFORE_SUNRISE_MINUTES,
  SHADOW_TEXTURE_LOCATION,
  shadowControlOf,
  shadowSeasonDays,
  type ShadowClock,
} from "./shadow";

const ASSETS = "https://assets.example/dz-b-prm/derived";

const shadowTool = (extra: Record<string, unknown> = {}) => ({
  addon: "shadowTexture",
  config: { assetBaseUrl: ASSETS, bridge: "existing", ...extra },
});

const scene = (...layers: MappingConfig["layers"]): MappingConfig => ({
  layers,
});

/** 21 June 2026, 12:00 UTC */
const NOW = Date.UTC(2026, 5, 21, 12);

const clock = (extra: Partial<ShadowClock> = {}): ShadowClock => ({
  date: { year: 2026, dayOfYear: 172, minutes: 12 * 60 },
  play: null,
  cycleSeconds: 60,
  since: NOW,
  ...extra,
});

describe("findSceneShadow", () => {
  it("reads the shadows a style layer launches, with the addon's defaults", () => {
    expect(
      findSceneShadow(
        scene({ id: "base" }, { id: "schatten", tools: [shadowTool()] })
      )
    ).toMatchObject({
      title: "Schatten",
      autoplay: null,
      cycleSeconds: 60,
      daylightOnly: false,
    });
  });

  it("reads the start moment, the playback and its length", () => {
    const shadow = findSceneShadow(
      scene({
        id: "schatten",
        tools: [
          shadowTool({
            initialDayOfYear: 80,
            initialMinutes: 600,
            autoplay: "day",
            cycleSeconds: 120,
            daylightOnly: true,
          }),
        ],
      })
    );
    expect(shadow).toMatchObject({
      initialDayOfYear: 80,
      initialMinutes: 600,
      autoplay: "day",
      cycleSeconds: 120,
      daylightOnly: true,
    });
  });

  it("tells another start moment apart, not another bridge", () => {
    const keyOf = (extra: Record<string, unknown>) =>
      findSceneShadow(scene({ id: "s", tools: [shadowTool(extra)] }))?.key;
    expect(keyOf({ bridge: "planning" })).toBe(keyOf({ bridge: "existing" }));
    expect(keyOf({ initialMinutes: 600 })).not.toBe(keyOf({}));
  });

  it("launches nothing without assets, and never from the shadow row", () => {
    expect(
      findSceneShadow(
        scene(
          { id: "a", tools: [{ addon: "shadowTexture", config: {} }] },
          { id: "__shadow_texture__", tools: [shadowTool()] }
        )
      )
    ).toBeNull();
    expect(findSceneShadow(null)).toBeNull();
  });
});

describe("approximateDaylight", () => {
  it("stays within a few minutes of the display's sunrise and sunset", () => {
    for (const dayOfYear of [1, 60, 80, 120, 172, 200, 266, 300, 355]) {
      const display = getDaylightWindow(
        { year: 2026, dayOfYear, timeZone: "Europe/Berlin" },
        SHADOW_TEXTURE_LOCATION
      );
      const phone = approximateDaylight({ year: 2026, dayOfYear });
      expect(Math.abs(phone.sunriseMinutes - display.sunriseMinutes)).toBeLessThan(3);
      expect(Math.abs(phone.sunsetMinutes - display.sunsetMinutes)).toBeLessThan(3);
    }
  });

  it("puts the highest sun within a few minutes of the display's", () => {
    for (const dayOfYear of [1, 80, 172, 266, 355]) {
      const date = { year: 2026, dayOfYear, timeZone: "Europe/Berlin" };
      const elevations = Array.from(
        { length: 24 * 60 },
        (_, minutes) =>
          getSolarPosition({ ...date, minutes }, SHADOW_TEXTURE_LOCATION)
            .elevationDegrees
      );
      const highest = elevations.indexOf(Math.max(...elevations));
      const { noonMinutes } = approximateDaylight({ year: 2026, dayOfYear });
      expect(Math.abs(noonMinutes - highest)).toBeLessThan(3);
    }
  });
});

describe("shadowSeasonDays", () => {
  const dayOf = (year: number, month: number, day: number) =>
    Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;

  it("names the equinoxes and solstices of 2026 on the shadows' clock", () => {
    // 20.03. 14:46, 21.06. 08:24, 23.09. 00:05, 21.12. 20:50 UTC
    expect(shadowSeasonDays(2026)).toEqual([
      { id: "spring", label: "Frühlingsanfang", dayOfYear: dayOf(2026, 3, 20) },
      { id: "longest", label: "Längster Tag", dayOfYear: dayOf(2026, 6, 21) },
      { id: "autumn", label: "Herbstanfang", dayOfYear: dayOf(2026, 9, 23) },
      { id: "shortest", label: "Kürzester Tag", dayOfYear: dayOf(2026, 12, 21) },
    ]);
  });

  it("counts a solstice after local midnight to the next day", () => {
    // 22.12.2027 02:43 UTC is 03:43 in Wuppertal; 20.06.2028 19:59 UTC is still the 20th
    expect(shadowSeasonDays(2027)[3].dayOfYear).toBe(dayOf(2027, 12, 22));
    expect(shadowSeasonDays(2028)[1].dayOfYear).toBe(dayOf(2028, 6, 20));
  });
});

describe("initialShadowClock", () => {
  it("starts at the configured moment, playing what the style says", () => {
    const shadow = findSceneShadow(
      scene({
        id: "s",
        tools: [
          shadowTool({
            initialDayOfYear: 172,
            initialMinutes: 900,
            autoplay: "year",
          }),
        ],
      })
    )!;
    const started = initialShadowClock(shadow, NOW);
    expect(started.date).toMatchObject({ dayOfYear: 172, minutes: 900 });
    expect(started.play).toBe("year");
    expect(started.since).toBe(NOW);
  });

  it("starts today an hour before sunrise without a moment, and keeps a night as named", () => {
    const { sunriseMinutes } = approximateDaylight({ year: 2026, dayOfYear: 172 });
    expect(initialShadowDate({}, NOW)).toEqual({
      year: 2026,
      dayOfYear: 172,
      minutes: Math.round(sunriseMinutes - SHADOW_START_BEFORE_SUNRISE_MINUTES),
    });
    // 21 June in Wuppertal: sunrise shortly after 05:15 summer time
    expect(initialShadowDate({}, NOW).minutes).toBeGreaterThan(4 * 60);
    expect(initialShadowDate({}, NOW).minutes).toBeLessThan(4 * 60 + 30);
    expect(initialShadowDate({ initialMinutes: 60 }, NOW).minutes).toBe(60);
  });
});

describe("clockShadowDate", () => {
  const allDay = { daylightOnly: false };

  it("stands still while nothing plays", () => {
    expect(clockShadowDate(clock(), allDay, NOW + 30_000)).toEqual(
      clock().date
    );
  });

  it("walks the 24 hours once per cycle", () => {
    const date = clockShadowDate(clock({ play: "day" }), allDay, NOW + 15_000);
    expect(date.minutes).toBeCloseTo(18 * 60);
    expect(date.dayOfYear).toBe(172);
  });

  it("starts the day over after midnight, on the same day", () => {
    const date = clockShadowDate(
      clock({ play: "day" }),
      allDay,
      NOW + 45_000 + 7_500
    );
    expect(date.minutes).toBeCloseTo(9 * 60);
    expect(date.dayOfYear).toBe(172);
  });

  it("walks the daylight once per cycle and starts over at sunrise", () => {
    const daylight = approximateDaylight({ year: 2026, dayOfYear: 172 });
    const length = daylight.sunsetMinutes - daylight.sunriseMinutes;
    const morning = clock({
      play: "day",
      date: {
        year: 2026,
        dayOfYear: 172,
        minutes: Math.ceil(daylight.sunriseMinutes),
      },
    });
    expect(
      clockShadowDate(morning, { daylightOnly: true }, NOW + 30_000).minutes
    ).toBeCloseTo(Math.ceil(daylight.sunriseMinutes) + length / 2, 0);
    const later = clockShadowDate(
      morning,
      { daylightOnly: true },
      NOW + 75_000
    ).minutes;
    expect(later).toBeGreaterThan(daylight.sunriseMinutes);
    expect(later).toBeLessThan(daylight.sunriseMinutes + length / 2);
  });

  it("walks the year once per cycle, at the same time of day", () => {
    const date = clockShadowDate(
      clock({ play: "year", cycleSeconds: 365 }),
      allDay,
      NOW + 10_000
    );
    expect(date.dayOfYear).toBe(182);
    expect(date.minutes).toBe(12 * 60);
  });
});

describe("shadowControlOf", () => {
  it("writes where the clock is, with the seek it carries", () => {
    expect(
      shadowControlOf(
        clock({ play: "day", seekAt: 7 }),
        { daylightOnly: false },
        NOW + 15_000
      )
    ).toEqual({
      dayOfYear: 172,
      minutes: 18 * 60,
      play: "day",
      cycleSeconds: 60,
      seekAt: 7,
    });
  });
});

describe("isShadowControl", () => {
  const valid = { dayOfYear: 172, minutes: 720, play: null, cycleSeconds: 60 };

  it("takes a complete entry", () => {
    expect(isShadowControl(valid)).toBe(true);
    expect(isShadowControl({ ...valid, play: "year", seekAt: 3 })).toBe(true);
  });

  it("refuses a moment outside the year or the day", () => {
    expect(isShadowControl({ ...valid, dayOfYear: 0 })).toBe(false);
    expect(isShadowControl({ ...valid, minutes: 1440 })).toBe(false);
    expect(isShadowControl({ ...valid, play: "week" })).toBe(false);
    expect(isShadowControl({ ...valid, cycleSeconds: 0 })).toBe(false);
    expect(isShadowControl(null)).toBe(false);
  });
});

describe("clampDayOfYear", () => {
  it("makes the 366th day the last one of a common year", () => {
    expect(clampDayOfYear(2026, 366)).toBe(365);
    expect(clampDayOfYear(2028, 366)).toBe(366);
  });
});

describe("planShadowApply", () => {
  const wanted = {
    dayOfYear: 100,
    minutes: 600,
    play: "day" as const,
    cycleSeconds: 90,
    seekAt: 5,
  };

  it("takes over everything on the first apply", () => {
    expect(planShadowApply(null, wanted)).toEqual({
      seekTo: { dayOfYear: 100, minutes: 600 },
      play: "day",
      cycleSeconds: 90,
    });
  });

  it("afterwards only follows what the presenter changed", () => {
    expect(
      planShadowApply({ play: "day", cycleSeconds: 90, seekAt: 5 }, wanted)
    ).toEqual({});
    expect(
      planShadowApply({ play: null, cycleSeconds: 60, seekAt: 4 }, wanted)
    ).toEqual({
      seekTo: { dayOfYear: 100, minutes: 600 },
      play: "day",
      cycleSeconds: 90,
    });
  });
});
