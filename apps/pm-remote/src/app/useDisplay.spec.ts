// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";

import type { MappingConfig } from "@carma-api";
import {
  approximateDaylight,
  SHADOW_START_BEFORE_SUNRISE_MINUTES,
  type RelayTarget,
  type ShadowControl,
  type ShowScene,
} from "@carma-mapping/show-remote";

import { useDisplay } from "./useDisplay";

const relay = vi.hoisted(() => ({
  state: {} as unknown,
  writes: [] as Record<string, unknown>[],
}));

vi.mock("@carma-mapping/show-remote", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  helloRelay: async () => undefined,
  readRelayState: async () => ({ v: 1, state: relay.state }),
  writeRelayState: async (_target: unknown, state: Record<string, unknown>) => {
    relay.writes.push(state);
    return { v: relay.writes.length };
  },
}));

const TARGET: RelayTarget = { baseUrl: "http://localhost:8099", code: "TEST" };
const NO_SCENES: ShowScene[] = [];

const ASSETS = "https://wupp-3d-data.cismet.de/dz-b-prm/derived";

/** 21 June 2026, 12:00 on the shadows' clock (Berlin, summer time) */
const NOW = Date.UTC(2026, 5, 21, 10);

/** where a launch naming no time puts the shadows on that day */
const START = Math.round(
  approximateDaylight({ year: 2026, dayOfYear: 172 }).sunriseMinutes -
    SHADOW_START_BEFORE_SUNRISE_MINUTES
);

const shadowScene = (bridge: string): MappingConfig => ({
  layers: [
    {
      id: "schatten_bestand",
      tools: [
        { addon: "shadowTexture", config: { assetBaseUrl: ASSETS, bridge } },
      ],
    },
  ],
});

const scene = (id: string, config: MappingConfig): ShowScene => ({
  id,
  title: id,
  config,
});

const lastWrite = () => relay.writes[relay.writes.length - 1];

const lastShadow = () => lastWrite()?.["shadow"] as ShadowControl | undefined;

/** the phone connected to a display that was last sent `state` */
const connect = async (state: Record<string, unknown>) => {
  relay.state = state;
  const hook = renderHook(() => useDisplay(TARGET, NO_SCENES, 0));
  await waitFor(() => {
    expect(hook.result.current.connection).toBe("connected");
  });
  return hook;
};

describe("useDisplay shadows", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    relay.writes = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the clock where the launch puts the shadows and sends no entry until the presenter steers", async () => {
    const { result } = await connect({ config: shadowScene("existing") });

    expect(result.current.shadow).not.toBeNull();
    expect(result.current.shadowClock).toMatchObject({
      date: { year: 2026, dayOfYear: 172, minutes: START },
      play: null,
      cycleSeconds: 60,
    });

    act(() => {
      result.current.setBlackout(true);
    });
    await waitFor(() => {
      expect(relay.writes).toHaveLength(1);
    });
    expect(lastWrite()).not.toHaveProperty("shadow");
  });

  it("sends the clock once the presenter plays, and counts along in later writes", async () => {
    const { result } = await connect({ config: shadowScene("existing") });

    act(() => {
      result.current.setShadowPlay("day");
    });
    await waitFor(() => {
      expect(lastShadow()).toEqual({
        dayOfYear: 172,
        minutes: START,
        play: "day",
        cycleSeconds: 60,
      });
    });

    // a quarter of the 60 s pass through all 24 hours
    vi.setSystemTime(NOW + 15_000);
    act(() => {
      result.current.setBlackout(true);
    });
    await waitFor(() => {
      expect(lastShadow()).toMatchObject({ minutes: START + 360, play: "day" });
    });
  });

  it("gives every slider move its own seekAt", async () => {
    const { result } = await connect({ config: shadowScene("existing") });

    act(() => {
      result.current.seekShadow({ minutes: 600 });
    });
    const firstSeek = result.current.shadowClock?.seekAt;
    act(() => {
      result.current.seekShadow({ dayOfYear: 355 });
    });

    expect(firstSeek).toBe(NOW);
    await waitFor(() => {
      expect(lastShadow()).toMatchObject({ dayOfYear: 355, minutes: 600 });
    });
    expect(lastShadow()?.seekAt).toBeGreaterThan(firstSeek ?? Infinity);
  });

  it("takes over the entry the display was last sent when it reconnects", async () => {
    const sent: ShadowControl = {
      dayOfYear: 355,
      minutes: 540,
      play: "year",
      cycleSeconds: 120,
      seekAt: 7,
    };
    const { result } = await connect({
      config: shadowScene("existing"),
      shadow: sent,
    });

    expect(result.current.shadowClock).toMatchObject({
      date: { dayOfYear: 355, minutes: 540 },
      play: "year",
      cycleSeconds: 120,
      seekAt: 7,
    });

    act(() => {
      result.current.setBlackout(true);
    });
    await waitFor(() => {
      expect(lastShadow()).toEqual(sent);
    });
  });

  it("keeps the clock for the other bridge and drops it for a scene without shadows", async () => {
    const { result } = await connect({ config: shadowScene("existing") });
    act(() => {
      result.current.setShadowPlay("year");
    });
    await waitFor(() => {
      expect(lastShadow()).toMatchObject({ play: "year" });
    });

    act(() => {
      result.current.goToScene(scene("catalog", shadowScene("catalog")));
    });
    await waitFor(() => {
      expect(relay.writes).toHaveLength(2);
    });
    expect(lastShadow()).toMatchObject({ play: "year" });

    act(() => {
      result.current.goToScene(
        scene("plain", { layers: [{ id: "stadtplan" }] })
      );
    });
    await waitFor(() => {
      expect(relay.writes).toHaveLength(3);
    });
    expect(lastWrite()).not.toHaveProperty("shadow");
    expect(result.current.shadow).toBeNull();
    expect(result.current.shadowClock).toBeNull();
  });
});
