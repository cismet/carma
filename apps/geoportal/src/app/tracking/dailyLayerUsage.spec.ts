import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { claimDailyLayerUsage, resetDailyLayerUsage } from "./dailyLayerUsage";

/**
 * The clock is frozen for these tests, so the day-rollover cases are
 * deterministic and do not depend on when the suite happens to run. The dates
 * themselves are arbitrary - only the steps between them carry meaning.
 */
const DAY_ONE = "2026-09-04T09:00:00";
const NEXT_DAY = "2026-09-05T08:00:00";
const A_WEEK_LATER = "2026-09-11T08:00:00";

describe("claimDailyLayerUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DAY_ONE));
    window.localStorage.clear();
    resetDailyLayerUsage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts a layer once and refuses it afterwards", () => {
    expect(claimDailyLayerUsage("poi_awg")).toBe(true);
    expect(claimDailyLayerUsage("poi_awg")).toBe(false);
    expect(claimDailyLayerUsage("poi_awg")).toBe(false);
  });

  it("keeps layers apart", () => {
    expect(claimDailyLayerUsage("a")).toBe(true);
    expect(claimDailyLayerUsage("b")).toBe(true);
    expect(claimDailyLayerUsage("a")).toBe(false);
  });

  it("survives a reload on the same day", () => {
    expect(claimDailyLayerUsage("a")).toBe(true);

    // a new app start reads the record back out of localStorage
    resetDailyLayerUsageMemoryOnly();

    expect(claimDailyLayerUsage("a")).toBe(false);
  });

  it("counts again on the next day", () => {
    expect(claimDailyLayerUsage("a")).toBe(true);

    vi.setSystemTime(new Date(NEXT_DAY));

    expect(claimDailyLayerUsage("a")).toBe(true);
    expect(claimDailyLayerUsage("a")).toBe(false);
  });

  it("writes neither the layer id nor the date in the clear", () => {
    claimDailyLayerUsage("wuppUmwelt:einzelbaum_baumarten");

    const raw =
      window.localStorage.getItem("geoportal.tracking.dailyLayerUsage") ?? "";

    expect(raw).not.toContain("wuppUmwelt");
    expect(raw).not.toContain("einzelbaum_baumarten");
    expect(raw).not.toContain(DAY_ONE.slice(0, 10));
    // an md5 digest is 32 hex characters
    expect(JSON.parse(raw).ids[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(raw).d).toMatch(/^[0-9a-f]{32}$/);
  });

  it("hashes the same layer differently on a different day", () => {
    claimDailyLayerUsage("a");
    const first = window.localStorage.getItem(
      "geoportal.tracking.dailyLayerUsage"
    );

    vi.setSystemTime(new Date(NEXT_DAY));
    window.localStorage.clear();
    resetDailyLayerUsage();
    claimDailyLayerUsage("a");
    const second = window.localStorage.getItem(
      "geoportal.tracking.dailyLayerUsage"
    );

    expect(second).not.toEqual(first);
  });

  it("drops yesterday's entries instead of growing the record", () => {
    const key = "geoportal.tracking.dailyLayerUsage";

    ["a", "b", "c"].forEach((id) => claimDailyLayerUsage(id));
    const yesterday = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    expect(yesterday.ids).toHaveLength(3);

    vi.setSystemTime(new Date(NEXT_DAY));
    claimDailyLayerUsage("a");

    const today = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    expect(today.ids).toHaveLength(1);
    expect(today.d).not.toEqual(yesterday.d);
    // none of yesterday's digests survive
    yesterday.ids.forEach((old: string) =>
      expect(today.ids).not.toContain(old)
    );
  });

  it("never grows beyond one day, even after a long gap", () => {
    const key = "geoportal.tracking.dailyLayerUsage";

    ["a", "b", "c", "d", "e"].forEach((id) => claimDailyLayerUsage(id));
    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}").ids).toHaveLength(5);

    // app not opened for a week
    vi.setSystemTime(new Date(A_WEEK_LATER));
    claimDailyLayerUsage("a");
    claimDailyLayerUsage("b");

    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}").ids).toHaveLength(2);
  });

  it("still dedups within the session when storage is unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    expect(claimDailyLayerUsage("a")).toBe(true);
    expect(claimDailyLayerUsage("a")).toBe(false);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

/**
 * Drops only the in-memory record, leaving localStorage intact - which is what
 * a page reload looks like to this module.
 */
function resetDailyLayerUsageMemoryOnly() {
  const stored = window.localStorage.getItem(
    "geoportal.tracking.dailyLayerUsage"
  );
  resetDailyLayerUsage();
  if (stored) {
    window.localStorage.setItem("geoportal.tracking.dailyLayerUsage", stored);
  }
}
