import type { MappingConfig } from "@carma-api";

import { approximateDaylight } from "./shadow";
import {
  TRAFFIC_MAX_OFFSET_MINUTES,
  clampTrafficOffset,
  findSceneTraffic,
  formatTrafficTime,
  isTrafficControl,
  trafficClockOf,
  trafficDarkness,
  trafficJumpOffset,
} from "./traffic";

const NETWORK = "assets/dz-b-prm/traffic/verkehrsnetz_modell.json";

const trafficTool = (extra: Record<string, unknown> = {}) => ({
  addon: "trafficAnimation",
  config: { networkUrl: NETWORK, ...extra },
});

const scene = (...layers: MappingConfig["layers"]): MappingConfig => ({
  layers,
});

describe("isTrafficControl", () => {
  it("accepts an offset inside the last 24 hours, with or without a seek", () => {
    expect(isTrafficControl({ offsetMinutes: 0 })).toBe(true);
    expect(isTrafficControl({ offsetMinutes: 1440, seekAt: 5 })).toBe(true);
  });

  it("accepts a restart next to the offset", () => {
    expect(isTrafficControl({ offsetMinutes: 0, restartAt: 7 })).toBe(true);
  });

  it("rejects what the display cannot show", () => {
    expect(isTrafficControl(null)).toBe(false);
    expect(isTrafficControl({})).toBe(false);
    expect(isTrafficControl({ offsetMinutes: -1 })).toBe(false);
    expect(isTrafficControl({ offsetMinutes: 1441 })).toBe(false);
    expect(isTrafficControl({ offsetMinutes: Number.NaN })).toBe(false);
    expect(isTrafficControl({ offsetMinutes: 10, seekAt: "now" })).toBe(false);
    expect(isTrafficControl({ offsetMinutes: 10, restartAt: "now" })).toBe(false);
  });
});

describe("clampTrafficOffset", () => {
  it("rounds to whole minutes inside 0..24 h", () => {
    expect(clampTrafficOffset(12.4)).toBe(12);
    expect(clampTrafficOffset(-5)).toBe(0);
    expect(clampTrafficOffset(5000)).toBe(TRAFFIC_MAX_OFFSET_MINUTES);
    expect(clampTrafficOffset(Number.NaN)).toBe(0);
  });
});

describe("trafficClockOf", () => {
  it("reads the Wuppertal clock, not the machine's", () => {
    // 21:30 UTC is 23:30 in summer time
    const clock = trafficClockOf(Date.parse("2026-09-26T21:30:00Z"));
    expect(clock).toEqual({ year: 2026, dayOfYear: 269, minutes: 23 * 60 + 30 });
  });
});

describe("trafficJumpOffset", () => {
  it("jumps to this afternoon's 13:00 and last night's 23:00", () => {
    const now = new Date("2026-09-27T15:30:00+02:00");
    expect(trafficJumpOffset("day", now)).toBe(150);
    expect(trafficJumpOffset("night", now)).toBe(16 * 60 + 30);
    expect(trafficJumpOffset("live", now)).toBe(0);
  });

  it("takes yesterday's 13:00 in the morning", () => {
    const now = new Date("2026-09-27T10:00:00+02:00");
    expect(trafficJumpOffset("day", now)).toBe(21 * 60);
    expect(trafficJumpOffset("night", now)).toBe(11 * 60);
  });

  it("stays at 0 on the hour itself and rounds seconds down", () => {
    expect(trafficJumpOffset("day", new Date("2026-09-27T13:00:00+02:00"))).toBe(
      0
    );
    expect(trafficJumpOffset("day", new Date("2026-09-27T13:05:40+02:00"))).toBe(
      5
    );
  });

  it("counts real minutes across the spring clock change", () => {
    // 23:00 CET on 28 March to 04:00 CEST on 29 March is four hours, not five
    const now = new Date("2026-03-29T04:00:00+02:00");
    expect(trafficJumpOffset("night", now)).toBe(4 * 60);
  });

  it("counts real minutes across the autumn clock change", () => {
    // 23:00 CEST on 24 October to 13:30 CET on 25 October is 15.5 hours
    const now = new Date("2026-10-25T13:30:00+01:00");
    expect(trafficJumpOffset("night", now)).toBe(15 * 60 + 30);
    expect(trafficJumpOffset("day", now)).toBe(30);
  });

  it("never reaches further back than the slider", () => {
    for (let hour = 0; hour < 24; hour++) {
      const now = new Date(Date.UTC(2026, 5, 10, hour, 17));
      for (const kind of ["day", "night"] as const) {
        const offset = trafficJumpOffset(kind, now);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(TRAFFIC_MAX_OFFSET_MINUTES);
      }
    }
  });
});

describe("trafficDarkness", () => {
  it("is day at lunchtime and night at midnight, all year", () => {
    for (const month of [0, 3, 6, 9]) {
      expect(trafficDarkness(Date.UTC(2026, month, 15, 11))).toBe(0);
      expect(trafficDarkness(Date.UTC(2026, month, 15, 23))).toBe(1);
    }
  });

  it("is half dark at sunset and ramps over the twilight", () => {
    const day = { year: 2026, dayOfYear: 270 };
    const { sunsetMinutes } = approximateDaylight(day);
    // 27 September 2026 is summer time, two hours ahead of UTC
    const midnight = Date.parse("2026-09-27T00:00:00+02:00");
    const at = (minutes: number) => midnight + minutes * 60_000;
    expect(trafficDarkness(at(sunsetMinutes))).toBeCloseTo(0.5, 2);
    expect(trafficDarkness(at(sunsetMinutes - 25))).toBe(0);
    expect(trafficDarkness(at(sunsetMinutes + 25))).toBe(1);
  });
});

describe("formatTrafficTime", () => {
  it("names weekday, date and time on the Wuppertal clock", () => {
    const label = formatTrafficTime(Date.parse("2026-09-26T21:00:00Z"));
    expect(label).toContain("26.09.");
    expect(label).toContain("23:00");
  });
});

describe("findSceneTraffic", () => {
  it("reads the traffic a style layer launches", () => {
    expect(
      findSceneTraffic(
        scene({ id: "base" }, { id: "verkehr", tools: [trafficTool()] })
      )
    ).toEqual({
      key: JSON.stringify([NETWORK]),
      title: "Verkehr",
      networkUrl: NETWORK,
    });
  });

  it("takes title and start offset from the config, in either entry form", () => {
    const traffic = findSceneTraffic(
      scene({
        id: "verkehr",
        tools: [
          {
            kind: "trafficAnimation",
            config: {
              networkUrl: NETWORK,
              title: "Verkehr (Testdaten)",
              initialOffsetMinutes: 90.6,
            },
          },
        ],
      })
    );
    expect(traffic?.title).toBe("Verkehr (Testdaten)");
    expect(traffic?.initialOffsetMinutes).toBe(91);
  });

  it("lets the topmost complete traffic win", () => {
    const traffic = findSceneTraffic(
      scene(
        { id: "lower", tools: [trafficTool({ title: "lower" })] },
        { id: "upper", tools: [trafficTool({ title: "upper" })] },
        { id: "broken", tools: [trafficTool({ networkUrl: "" })] },
        { id: "other", tools: [{ addon: "timeSlider", config: {} }] }
      )
    );
    expect(traffic?.title).toBe("upper");
  });

  it("finds nothing in a scene without traffic", () => {
    expect(findSceneTraffic(null)).toBeNull();
    expect(findSceneTraffic(scene({ id: "base" }))).toBeNull();
  });
});
