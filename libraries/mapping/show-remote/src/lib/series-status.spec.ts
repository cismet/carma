import {
  SERIES_SEEK_GRACE_MS,
  SERIES_STATUS_STALE_MS,
  anchorSeriesClock,
  followedSeriesControl,
  isSeriesStatus,
  seriesStatusSessionCode,
  seriesView,
  type HeardSeriesStatus,
  type SeriesStatus,
} from "./series-status";
import type { SeriesClock } from "./time-series";

const NOW = 1_000_000;

/** 24 steps of 1.2 s, as the Starkregen series runs with cage */
const SERIES = { key: "t50", stepCount: 24, stepMs: 1200 };

const status = (extra: Partial<SeriesStatus> = {}): SeriesStatus => ({
  key: "t50",
  total: 24,
  loaded: 24,
  failed: 0,
  ready: true,
  step: 7,
  playing: true,
  ...extra,
});

const heard = (
  extra: Partial<SeriesStatus> = {},
  writtenAt = NOW - 100
): HeardSeriesStatus => ({ status: status(extra), writtenAt });

const clock = (extra: Partial<SeriesClock> = {}): SeriesClock => ({
  step: 2,
  playing: true,
  since: NOW - 6000,
  ...extra,
});

describe("isSeriesStatus", () => {
  it("takes what the display writes and nothing else", () => {
    expect(isSeriesStatus(status())).toBe(true);
    expect(isSeriesStatus(status({ seekAt: 5 }))).toBe(true);
    expect(isSeriesStatus(null)).toBe(false);
    expect(isSeriesStatus({ surface: "table" })).toBe(false);
    expect(isSeriesStatus({ ...status(), loaded: -1 })).toBe(false);
    expect(isSeriesStatus({ ...status(), step: 1.5 })).toBe(false);
    expect(isSeriesStatus({ ...status(), ready: "yes" })).toBe(false);
  });
});

describe("seriesStatusSessionCode", () => {
  it("is a session of its own next to the display's", () => {
    expect(seriesStatusSessionCode(" abcd2345 ")).toBe("ABCD2345-T");
  });
});

describe("seriesView", () => {
  it("counts on its own clock without word from the display", () => {
    // 6 s at 1.2 s per step: five steps on from step 2
    expect(seriesView(clock(), SERIES, null, NOW)).toEqual({
      kind: "own",
      step: 7,
    });
  });

  it("holds on the display's step while its frames load, however long the phone plays", () => {
    const loading = heard({ ready: false, loaded: 17, step: 0 });

    expect(seriesView(clock(), SERIES, loading, NOW)).toEqual({
      kind: "loading",
      step: 0,
      loaded: 17,
      total: 24,
      failed: 0,
    });
    expect(seriesView(clock(), SERIES, loading, NOW + 20_000).step).toBe(0);
  });

  it("follows the display's step once it runs", () => {
    expect(seriesView(clock(), SERIES, heard({ step: 11 }), NOW)).toEqual({
      kind: "following",
      step: 11,
    });
  });

  it("shows a fresh seek until the display shows it too", () => {
    const seeking = clock({ step: 20, seekAt: NOW - 200 });

    expect(seriesView(seeking, SERIES, heard({ step: 11 }), NOW).step).toBe(20);
    expect(
      seriesView(seeking, SERIES, heard({ step: 20, seekAt: NOW - 200 }), NOW)
        .step
    ).toBe(20);
    // no answer within the grace: the display is what is right
    expect(
      seriesView(
        seeking,
        SERIES,
        heard({ step: 11 }, NOW + SERIES_SEEK_GRACE_MS),
        NOW + SERIES_SEEK_GRACE_MS
      ).step
    ).toBe(11);
  });

  it("goes back to its own clock for another series or a status gone stale", () => {
    expect(seriesView(clock(), SERIES, heard({ key: "t100" }), NOW).kind).toBe(
      "own"
    );
    expect(
      seriesView(clock(), SERIES, heard({}, NOW - SERIES_STATUS_STALE_MS), NOW)
        .kind
    ).toBe("own");
  });
});

describe("anchorSeriesClock", () => {
  it("puts the clock on the display's step, keeping the phone's wishes", () => {
    const own = clock({ seekAt: NOW - 60_000 });
    expect(anchorSeriesClock(own, SERIES, heard({ step: 11 }), NOW)).toEqual({
      step: 11,
      playing: true,
      since: NOW,
      seekAt: NOW - 60_000,
    });
  });

  it("leaves it alone while a seek is on the way, or without a current status", () => {
    const seeking = clock({ seekAt: NOW - 200 });
    expect(anchorSeriesClock(seeking, SERIES, heard(), NOW)).toBe(seeking);
    const own = clock();
    expect(anchorSeriesClock(own, SERIES, null, NOW)).toBe(own);
  });
});

describe("followedSeriesControl", () => {
  it("writes the step the slider shows, not the one the phone counted to", () => {
    expect(
      followedSeriesControl(
        clock(),
        SERIES,
        heard({ ready: false, step: 0 }),
        NOW
      )
    ).toEqual({ step: 0, playing: true });
  });
});
