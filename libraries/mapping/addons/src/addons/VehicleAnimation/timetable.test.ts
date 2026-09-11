import { describe, expect, it } from "vitest";

import { createZonedClock, zonedMoment } from "./timetable";

const ZONE = "Europe/Berlin";

/** reads the clock every `stepMs` from `from` for `spanMs`, as a frame loop would */
const compareRun = (from: string, spanMs: number, stepMs: number): void => {
  const clock = createZonedClock(ZONE);
  const start = Date.parse(from);
  for (let epoch = start; epoch <= start + spanMs; epoch += stepMs) {
    const fast = clock(epoch);
    const exact = zonedMoment(ZONE, epoch);
    expect(fast.day).toBe(exact.day);
    expect(fast.weekday).toBe(exact.weekday);
    expect(fast.seconds).toBeCloseTo(exact.seconds, 6);
  }
};

describe("createZonedClock", () => {
  it("agrees with zonedMoment across local midnight", () => {
    compareRun("2026-09-11T21:58:00Z", 4 * 60_000, 1_337);
  });

  it("agrees with zonedMoment across the switch to summer time", () => {
    compareRun("2026-03-29T00:58:00Z", 4 * 60_000, 1_337);
  });

  it("agrees with zonedMoment across the switch back to winter time", () => {
    compareRun("2026-10-25T00:58:00Z", 4 * 60_000, 1_337);
  });

  it("agrees with zonedMoment when read at frame rate", () => {
    compareRun("2026-09-11T08:00:59Z", 3_000, 16.7);
  });

  it("agrees with zonedMoment when the clock jumps back", () => {
    const clock = createZonedClock(ZONE);
    const later = Date.parse("2026-09-11T10:00:30Z");
    const earlier = Date.parse("2026-09-11T09:00:10Z");
    clock(later);
    expect(clock(earlier).seconds).toBeCloseTo(
      zonedMoment(ZONE, earlier).seconds,
      6
    );
  });
});
