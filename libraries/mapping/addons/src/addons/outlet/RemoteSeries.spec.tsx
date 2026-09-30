import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import { AddonProvider } from "@carma-mapping/contexts";
import type {
  SeriesStatus,
  TimeSeriesControl,
} from "@carma-mapping/show-remote";

import { useAddonState } from "../../lib/AddonStateContext";
import {
  TIME_SLIDER_STATE_DEFAULT,
  type TimeSliderState,
} from "../TimeSlider/timeslider-actions";
import { RemoteSeries } from "./RemoteSeries";

const WMS = "https://wms.example/geoserver/wms?SERVICE=WMS";
const LAYERS = Array.from({ length: 24 }, (_, index) => `s:t${index}`);
const KEY = JSON.stringify([WMS, "", LAYERS]);

/** a caged series of 24 steps, 20 sub-steps each, loading its frames */
const seriesOn = (extra: Partial<TimeSliderState> = {}): TimeSliderState => ({
  ...TIME_SLIDER_STATE_DEFAULT,
  isOn: true,
  wmsUrl: WMS,
  layers: LAYERS,
  stepsPerUnit: 20,
  max: 23 * 20,
  isBlending: true,
  loaded: 17,
  failed: 0,
  clockReady: false,
  ...extra,
});

const handle: {
  series?: TimeSliderState;
  setSeries?: (
    action: (previous: TimeSliderState | undefined) => TimeSliderState
  ) => void;
} = {};

const Probe = () => {
  const [series, setSeries] = useAddonState("timeSeries");
  handle.series = series;
  handle.setSeries = setSeries;
  return null;
};

const heard: (SeriesStatus | null)[] = [];
const onStatus = (status: SeriesStatus | null) => {
  heard.push(status);
};
const lastHeard = () => heard[heard.length - 1];

/** the same list every render, which keeps the provider's state */
const NO_ADDONS: unknown[] = [];

const view = (wanted: TimeSeriesControl | null) => (
  <AddonProvider addons={NO_ADDONS}>
    <RemoteSeries wanted={wanted} onStatus={onStatus} />
    <Probe />
  </AddonProvider>
);

const set = (patch: Partial<TimeSliderState>) =>
  act(() => {
    handle.setSeries?.((previous) => ({
      ...(previous ?? TIME_SLIDER_STATE_DEFAULT),
      ...patch,
    }));
  });

describe("RemoteSeries status", () => {
  afterEach(() => {
    cleanup();
    heard.length = 0;
    delete handle.series;
  });

  it("says no series while none is on", () => {
    render(view(null));

    expect(lastHeard()).toBeNull();
  });

  it("tells the frames, the gate and the step of the series on", () => {
    render(view(null));
    set(seriesOn({ value: 7 * 20, isPlaying: true }));

    expect(lastHeard()).toEqual({
      key: KEY,
      total: 24,
      loaded: 17,
      failed: 0,
      ready: false,
      step: 7,
      playing: true,
    });

    set({ loaded: 24, clockReady: true });

    expect(lastHeard()).toMatchObject({ loaded: 24, ready: true, step: 7 });
  });

  it("names a seek only once the series shows its step", () => {
    const { rerender } = render(view({ step: 3, playing: false, seekAt: 1 }));
    set(seriesOn());

    expect(handle.series?.value).toBe(60);
    expect(lastHeard()).toMatchObject({ step: 3, seekAt: 1 });

    rerender(view({ step: 12, playing: false, seekAt: 2 }));

    // every status that names the new seek shows its step too
    const named = heard.filter((status) => status?.seekAt === 2);
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((status) => status?.step === 12)).toBe(true);
    expect(lastHeard()).toMatchObject({ step: 12, seekAt: 2 });
  });

  it("says no series while it is hidden or gone", () => {
    render(view(null));
    set(seriesOn());
    expect(lastHeard()).not.toBeNull();

    set({ isHidden: true });
    expect(lastHeard()).toBeNull();

    set({ isHidden: false });
    expect(lastHeard()).not.toBeNull();

    set({ isOn: false });
    expect(lastHeard()).toBeNull();
  });
});
