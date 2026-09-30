// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";

import type { MappingConfig } from "@carma-api";
import {
  approximateDaylight,
  SHADOW_START_BEFORE_SUNRISE_MINUTES,
  type RelayTarget,
  type ShadowControl,
  type ShowScene,
  type TrafficControl,
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

describe("useDisplay highlights", () => {
  const spot = (id: string) => ({
    id,
    title: `Punkt ${id}`,
    center: [791700, 6664800] as const,
    radiusMeters: 80,
    dim: 0.75,
  });
  const lit: ShowScene = {
    id: "lit",
    title: "lit",
    config: { layers: [{ id: "stadtplan" }] },
    highlights: [spot("a"), spot("b")],
  };
  const other: ShowScene = {
    id: "other",
    title: "other",
    config: { layers: [{ id: "luftbild" }] },
  };
  const scenes = [lit, other];

  const connectWith = async (state: Record<string, unknown>) => {
    relay.state = state;
    const hook = renderHook(() => useDisplay(TARGET, scenes, 0));
    await waitFor(() => {
      expect(hook.result.current.connection).toBe("connected");
    });
    return hook;
  };

  const lastIds = () =>
    (lastWrite()?.["highlights"] as { id: string }[] | undefined)?.map(
      ({ id }) => id
    );

  beforeEach(() => {
    relay.writes = [];
  });

  it("sends the switched-on spots of the live scene, each on its own", async () => {
    const { result } = await connectWith({ config: lit.config });
    expect(result.current.activeSceneId).toBe("lit");

    act(() => {
      result.current.toggleHighlight("lit", ["b"]);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["b"]);
    });
    act(() => {
      result.current.toggleHighlight("lit", ["a"]);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["a", "b"]);
    });
    expect(lastWrite()?.["highlights"]).toEqual([
      { id: "a", center: [791700, 6664800], radiusMeters: 80, dim: 0.75 },
      { id: "b", center: [791700, 6664800], radiusMeters: 80, dim: 0.75 },
    ]);

    act(() => {
      result.current.toggleHighlight("lit", ["a"]);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["b"]);
    });
  });

  it("switches the spots of one button together", async () => {
    const { result } = await connectWith({ config: lit.config });
    act(() => {
      result.current.toggleHighlight("lit", ["b"]);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["b"]);
    });
    // one of them on: the button lights the rest
    act(() => {
      result.current.toggleHighlight("lit", ["a", "b"]);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["a", "b"]);
    });
    act(() => {
      result.current.toggleHighlight("lit", ["a", "b"]);
    });
    await waitFor(() => {
      expect(lastWrite()).not.toHaveProperty("highlights");
    });
  });

  it("switches them all off with the next scene", async () => {
    const { result } = await connectWith({ config: lit.config });
    act(() => {
      result.current.toggleHighlight("lit", ["a"]);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["a"]);
    });

    act(() => {
      result.current.goToScene(other);
    });
    await waitFor(() => {
      expect(result.current.activeSceneId).toBe("other");
    });
    await waitFor(() => {
      expect(lastWrite()).not.toHaveProperty("highlights");
    });
    expect(result.current.litHighlights).toBeNull();
  });

  it("takes over the spots the display had on when it reconnects", async () => {
    const { result } = await connectWith({
      config: lit.config,
      highlights: [
        { id: "a", center: [791700, 6664800], radiusMeters: 80, dim: 0.75 },
      ],
    });
    await waitFor(() => {
      expect(result.current.litHighlights).toEqual({
        sceneId: "lit",
        on: ["a"],
      });
    });

    act(() => {
      result.current.setBlackout(true);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["a"]);
    });
  });
});

describe("useDisplay traffic", () => {
  const trafficScene: MappingConfig = {
    layers: [
      {
        id: "verkehr",
        tools: [
          {
            addon: "trafficAnimation",
            config: { networkUrl: "https://example.test/netz.json" },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    relay.writes = [];
  });

  it("runs live and sends nothing until the presenter moves the slider", async () => {
    const { result } = await connect({ config: trafficScene });
    expect(result.current.traffic).not.toBeNull();
    expect(result.current.trafficControl).toEqual({ offsetMinutes: 0 });

    act(() => {
      result.current.setBlackout(true);
    });
    await waitFor(() => {
      expect(relay.writes).toHaveLength(1);
    });
    expect(lastWrite()).not.toHaveProperty("traffic");
  });

  it("sends the offset once set, clamped to the last 24 hours", async () => {
    const { result } = await connect({ config: trafficScene });
    act(() => {
      result.current.setTrafficOffset(90);
    });
    await waitFor(() => {
      expect(lastWrite()?.["traffic"]).toMatchObject({ offsetMinutes: 90 });
    });
    act(() => {
      result.current.setTrafficOffset(5000);
    });
    await waitFor(() => {
      expect(lastWrite()?.["traffic"]).toMatchObject({ offsetMinutes: 1440 });
    });
  });

  it("restarts at the same offset, with a new value for every press", async () => {
    const lastTraffic = () => lastWrite()?.["traffic"] as TrafficControl;
    const { result } = await connect({ config: trafficScene });
    act(() => {
      result.current.setTrafficOffset(90);
    });
    act(() => {
      result.current.restartTraffic();
    });
    await waitFor(() => {
      expect(lastTraffic()?.restartAt).toBeDefined();
    });
    expect(lastTraffic().offsetMinutes).toBe(90);
    const first = lastTraffic().restartAt ?? 0;

    act(() => {
      result.current.restartTraffic();
    });
    await waitFor(() => {
      expect(lastTraffic().restartAt).toBeGreaterThan(first);
    });

    // moving the slider afterwards keeps the last restart, so it is not taken again
    const second = lastTraffic().restartAt;
    act(() => {
      result.current.setTrafficOffset(0);
    });
    await waitFor(() => {
      expect(lastTraffic().offsetMinutes).toBe(0);
    });
    expect(lastTraffic().restartAt).toBe(second);
  });

  it("sends a restart of traffic the presenter never moved, at its offset", async () => {
    const { result } = await connect({ config: trafficScene });
    act(() => {
      result.current.restartTraffic();
    });
    await waitFor(() => {
      expect(lastWrite()?.["traffic"]).toMatchObject({ offsetMinutes: 0 });
    });
    expect(lastWrite()?.["traffic"]).toHaveProperty("restartAt");
  });

  it("takes over the offset the display was last sent when it reconnects", async () => {
    const { result } = await connect({
      config: trafficScene,
      traffic: { offsetMinutes: 600, seekAt: 3 },
    });
    expect(result.current.trafficControl).toEqual({
      offsetMinutes: 600,
      seekAt: 3,
    });
  });

  it("forgets it with a scene without traffic", async () => {
    const { result } = await connect({ config: trafficScene });
    act(() => {
      result.current.setTrafficOffset(60);
    });
    act(() => {
      result.current.goToScene(
        scene("plain", { layers: [{ id: "stadtplan" }] })
      );
    });
    await waitFor(() => {
      expect(result.current.traffic).toBeNull();
    });
    expect(lastWrite()).not.toHaveProperty("traffic");
  });
});
