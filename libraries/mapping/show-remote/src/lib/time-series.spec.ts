import type { MappingConfig } from "@carma-api";

import {
  clockStep,
  findSceneSeries,
  isTimeSeriesControl,
  planSeriesApply,
  seriesControlOf,
  type SceneSeries,
} from "./time-series";

const LAYERS = ["s:a", "s:b", "s:c", "s:d", "s:e"];
const LABELS = ["5m", "10m", "15m", "20m", "25m"];

const seriesTool = (extra: Record<string, unknown> = {}) => ({
  addon: "timeSlider",
  config: {
    title: "T50",
    wmsUrl: "https://wms.example/geoserver/wms?SERVICE=WMS",
    styles: "starkregen:depth",
    layers: LAYERS,
    labels: LABELS,
    initialStep: 2,
    ...extra,
  },
});

const scene = (...layers: MappingConfig["layers"]): MappingConfig => ({
  layers,
});

describe("findSceneSeries", () => {
  it("reads the series a style layer launches", () => {
    const series = findSceneSeries(
      scene({ id: "base" }, { id: "t50", tools: [seriesTool()] })
    );
    expect(series).toMatchObject({
      title: "T50",
      labels: LABELS,
      stepCount: 5,
      initialStep: 2,
      autoplay: false,
      // 60 ms per sub-step, 20 sub-steps per step
      stepMs: 1200,
    });
  });

  it("takes autoplay and the pacing from the config, in either entry form", () => {
    const series = findSceneSeries(
      scene({
        id: "t50",
        tools: [
          {
            kind: "timeSlider",
            config: {
              ...seriesTool().config,
              autoplay: true,
              intermediateValuesCount: 10,
              playIntervalMs: 50,
            },
          },
        ],
      })
    );
    expect(series?.autoplay).toBe(true);
    expect(series?.stepMs).toBe(500);
  });

  it("lets the topmost complete series win and skips the series' own row", () => {
    const series = findSceneSeries(
      scene(
        { id: "lower", tools: [seriesTool({ title: "lower" })] },
        { id: "upper", tools: [seriesTool({ title: "upper" })] },
        { id: "broken", tools: [seriesTool({ title: "broken", layers: [] })] },
        { id: "__timeSlider__", tools: [seriesTool({ title: "row" })] }
      )
    );
    expect(series?.title).toBe("upper");
  });

  it("finds nothing without a launching layer", () => {
    expect(findSceneSeries(undefined)).toBeNull();
    expect(findSceneSeries(scene({ id: "a", tools: ["zoomToExtent"] }))).toBe(
      null
    );
  });

  it("gives the same series the same key in any scene", () => {
    const a = findSceneSeries(scene({ id: "x", tools: [seriesTool()] }));
    const b = findSceneSeries(
      scene({ id: "y", opacity: 0.5, tools: [seriesTool({ opacity: 0.4 })] })
    );
    const other = findSceneSeries(
      scene({ id: "x", tools: [seriesTool({ layers: ["s:z"] })] })
    );
    expect(a?.key).toBe(b?.key);
    expect(a?.key).not.toBe(other?.key);
  });
});

describe("clockStep", () => {
  const series = { stepCount: 5, stepMs: 1000 } as SceneSeries;

  it("stays on its step while paused", () => {
    expect(
      clockStep({ step: 3, playing: false, since: 0 }, series, 99_000)
    ).toBe(3);
  });

  it("advances one step per step duration while playing", () => {
    const clock = { step: 1, playing: true, since: 10_000 };
    expect(clockStep(clock, series, 10_400)).toBe(1);
    expect(clockStep(clock, series, 12_000)).toBe(3);
  });

  it("starts over after the last step, as the display does", () => {
    // four steps from the first to the last, then back to the first
    const clock = { step: 0, playing: true, since: 0 };
    expect(clockStep(clock, series, 4_000)).toBe(0);
    expect(clockStep(clock, series, 3_800)).toBe(4);
    expect(clockStep(clock, series, 5_000)).toBe(1);
  });

  it("keeps a step inside the series", () => {
    expect(clockStep({ step: 9, playing: false, since: 0 }, series, 0)).toBe(4);
  });
});

describe("seriesControlOf", () => {
  it("writes where the clock is now, and the seek it last made", () => {
    const series = { stepCount: 5, stepMs: 1000 } as SceneSeries;
    expect(
      seriesControlOf(
        { step: 1, playing: true, since: 0, seekAt: 7 },
        series,
        2_000
      )
    ).toEqual({ step: 3, playing: true, seekAt: 7 });
  });
});

describe("isTimeSeriesControl", () => {
  it("takes a complete entry, with or without a seek", () => {
    expect(isTimeSeriesControl({ step: 2, playing: true })).toBe(true);
    expect(isTimeSeriesControl({ step: 0, playing: false, seekAt: 5 })).toBe(
      true
    );
  });

  it("refuses malformed entries", () => {
    expect(isTimeSeriesControl({ step: -1, playing: true })).toBe(false);
    expect(isTimeSeriesControl({ step: 1.5, playing: true })).toBe(false);
    expect(isTimeSeriesControl({ step: 1, playing: "yes" })).toBe(false);
    expect(isTimeSeriesControl({ step: 1, playing: true, seekAt: "x" })).toBe(
      false
    );
    expect(isTimeSeriesControl(null)).toBe(false);
  });
});

describe("planSeriesApply", () => {
  it("takes over step and play state on the first apply", () => {
    expect(planSeriesApply(null, { step: 4, playing: true })).toEqual({
      seekTo: 4,
      play: true,
    });
  });

  it("does nothing when the same entry comes again", () => {
    expect(
      planSeriesApply(
        { seekAt: 3, playing: true },
        { step: 9, playing: true, seekAt: 3 }
      )
    ).toEqual({});
  });

  it("jumps only on a new seek, so a running animation is not pulled back", () => {
    expect(
      planSeriesApply(
        { seekAt: 3, playing: true },
        { step: 6, playing: true, seekAt: 4 }
      )
    ).toEqual({ seekTo: 6 });
  });

  it("pauses where the display is, without a jump", () => {
    expect(
      planSeriesApply(
        { seekAt: 3, playing: true },
        { step: 6, playing: false, seekAt: 3 }
      )
    ).toEqual({ play: false });
  });
});
