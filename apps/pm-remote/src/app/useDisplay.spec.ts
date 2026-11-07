// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";

import type { MappingConfig } from "@carma-api";
import {
  approximateDaylight,
  baseOf,
  findSceneSeries,
  SERIES_STATUS_STALE_MS,
  seriesView,
  SHADOW_START_BEFORE_SUNRISE_MINUTES,
  type RelayTarget,
  type SeriesStatus,
  type ShadowControl,
  type Presenter,
  type ShowScene,
  type TimeSeriesControl,
  type TrafficControl,
  withTargetSections,
} from "@carma-mapping/show-remote";

import { useDisplay } from "./useDisplay";

type Session = { v: number; state: unknown };

const relay = vi.hoisted(() => ({
  /** the presenter session the phone follows and writes */
  presenter: { v: 0, state: null } as Session,
  /** what the phone wrote into it, oldest first */
  writes: [] as Record<string, unknown>[],
  /** what the display last wrote into its series status session */
  series: { v: 0, state: null } as Session,
  /** readers waiting for the next write to either session */
  wake: [] as (() => void)[],
}));

vi.mock("@carma-mapping/show-remote", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@carma-mapping/show-remote")
  >();
  const sessionOf = (code: string): Session =>
    code.endsWith("-T") ? relay.series : relay.presenter;
  // a held request, answered by the next write to its session
  const link: import("@carma-mapping/show-remote").RelayLink = {
    hello: async () => undefined,
    wait: async (target, since, _waitMs, signal) => {
      while (since === sessionOf(target.code).v) {
        await new Promise<void>((resolve, reject) => {
          relay.wake.push(resolve);
          signal?.addEventListener("abort", () => reject(new Error("stopped")));
        });
      }
      const { v, state } = sessionOf(target.code);
      const now = Date.now();
      return { v, state, ts: now, now };
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
  return {
    ...actual,
    helloRelay: async () => undefined,
    readRelayState: async () => ({ v: 1, state: null }),
    subscribeRelay: (
      options: import("@carma-mapping/show-remote").SubscribeRelayOptions
    ) => actual.subscribeRelay({ ...options, link }),
    writeRelayState: async (
      _target: unknown,
      doc: Record<string, unknown>,
      _timeoutMs?: number,
      ifV?: number
    ) => {
      const { v, state } = relay.presenter;
      if (ifV !== undefined && ifV !== v) {
        throw new actual.RelayError("conflict", 409, { v, state });
      }
      relay.writes.push(doc);
      relay.presenter = { v: v + 1, state: doc };
      relay.wake.splice(0).forEach((wake) => wake());
      return { v: v + 1, ts: Date.now() };
    },
  };
});

const TARGET: RelayTarget = { baseUrl: "http://localhost:8099", code: "TEST" };
const NO_SCENES: ShowScene[] = [];
const ME: Presenter = { name: "Anna", device: "phone-anna" };
const OTHER: Presenter = { name: "Ben", device: "phone-ben" };

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

/** what every display was told by the phone's last write */
const lastWrite = () =>
  relay.writes[relay.writes.length - 1]?.["*"] as
    | Record<string, unknown>
    | undefined;

const lastShadow = () => lastWrite()?.["shadow"] as ShadowControl | undefined;

/** somebody else writes the presenter session */
const writeElsewhere = (doc: unknown, wake = true) => {
  relay.presenter = { v: relay.presenter.v + 1, state: doc };
  if (wake) {
    relay.wake.splice(0).forEach((resume) => resume());
  }
};

/** the phone, presenting, connected to a display that was last sent `state` */
const connect = async (
  state: Record<string, unknown>,
  scenes: readonly ShowScene[] = NO_SCENES
) => {
  relay.presenter = { v: 1, state: { "*": state, _presenter: ME } };
  const hook = renderHook(() => useDisplay(TARGET, scenes, 0, ME));
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

  const connectWith = (state: Record<string, unknown>) =>
    connect(state, scenes);

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

  it("switches all of a scene's highlights on once it is there", async () => {
    const { result } = await connectWith({ config: other.config });
    act(() => {
      result.current.goToScene(lit);
    });
    await waitFor(() => {
      expect(lastIds()).toEqual(["a", "b"]);
    });
    expect(result.current.litHighlights).toEqual({
      sceneId: "lit",
      on: ["a", "b"],
    });
    expect(result.current.isChanging).toBe(false);
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

describe("useDisplay series", () => {
  const WMS = "https://wms.example/geoserver/wms?SERVICE=WMS";
  const LAYERS = Array.from({ length: 24 }, (_, index) => `s:t${index}`);

  /** the Starkregen series: 24 steps of 1.2 s */
  const seriesScene = (autoplay = true): MappingConfig => ({
    layers: [
      {
        id: "t50",
        tools: [
          {
            addon: "timeSlider",
            config: { title: "T50", wmsUrl: WMS, layers: LAYERS, autoplay },
          },
        ],
      },
    ],
  });
  const SERIES = findSceneSeries(seriesScene());
  const KEY = SERIES?.key ?? "";

  /** the display writes where its series stands */
  const tell = (extra: Partial<SeriesStatus>) => {
    relay.series = {
      v: relay.series.v + 1,
      state: {
        key: KEY,
        total: 24,
        loaded: 24,
        failed: 0,
        ready: true,
        step: 0,
        playing: true,
        ...extra,
      },
    };
    relay.wake.splice(0).forEach((wake) => wake());
  };

  /** the display runs no series, as when a scene without one is on */
  const tellNone = () => {
    relay.series = { v: relay.series.v + 1, state: null };
    relay.wake.splice(0).forEach((wake) => wake());
  };

  const lastSeries = () =>
    lastWrite()?.["timeSeries"] as TimeSeriesControl | undefined;

  type Hook = Awaited<ReturnType<typeof connect>>;

  /** what the phone's slider shows now */
  const shown = ({ result }: Hook) => {
    const clock = result.current.seriesClock;
    const series = result.current.series;
    if (!clock || !series) {
      throw new Error("no series on the phone");
    }
    return seriesView(clock, series, result.current.seriesStatus, Date.now());
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    relay.writes = [];
    relay.series = { v: 0, state: null };
    relay.wake = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts on its own clock while the display says nothing", async () => {
    const hook = await connect({ config: seriesScene() });

    vi.setSystemTime(NOW + 6000);

    expect(hook.result.current.seriesStatus).toBeNull();
    expect(shown(hook)).toEqual({ kind: "own", step: 5 });
    hook.unmount();
  });

  it("holds while the display loads its frames, however long it takes", async () => {
    const hook = await connect({ config: seriesScene() });
    act(() => tell({ ready: false, loaded: 17, step: 0 }));
    await waitFor(() => {
      expect(hook.result.current.seriesStatus).not.toBeNull();
    });

    vi.setSystemTime(NOW + 20_000);

    expect(shown(hook)).toEqual({
      kind: "loading",
      step: 0,
      loaded: 17,
      total: 24,
      failed: 0,
    });
    // pausing stops the display where it holds, not where the phone counted to
    act(() => {
      hook.result.current.setSeriesPlaying(false);
    });
    await waitFor(() => {
      expect(lastSeries()).toEqual({ step: 0, playing: false });
    });
    hook.unmount();
  });

  it("still sends play while the display loads, so it asks again for failed frames", async () => {
    const hook = await connect({ config: seriesScene(false) });
    act(() => tell({ ready: false, loaded: 21, failed: 3, playing: false }));
    await waitFor(() => {
      expect(hook.result.current.seriesStatus).not.toBeNull();
    });

    act(() => {
      hook.result.current.setSeriesPlaying(true);
    });

    await waitFor(() => {
      expect(lastSeries()).toEqual({ step: 0, playing: true });
    });
    expect(shown(hook)).toMatchObject({ kind: "loading", failed: 3 });
    hook.unmount();
  });

  it("follows the display's step once it runs", async () => {
    const hook = await connect({ config: seriesScene() });
    act(() => tell({ step: 11 }));
    await waitFor(() => {
      expect(shown(hook)).toEqual({ kind: "following", step: 11 });
    });
    expect(hook.result.current.seriesClock).toMatchObject({ step: 11 });

    act(() => tell({ step: 12 }));
    await waitFor(() => {
      expect(shown(hook).step).toBe(12);
    });
    hook.unmount();
  });

  it("goes back to its own clock when the display falls silent", async () => {
    const hook = await connect({ config: seriesScene() });
    act(() => tell({ step: 11 }));
    await waitFor(() => {
      expect(shown(hook).step).toBe(11);
    });

    vi.setSystemTime(NOW + SERIES_STATUS_STALE_MS);

    expect(shown(hook).kind).toBe("own");
    hook.unmount();
  });

  it("starts a re-entered series at its first step and has the display seek there", async () => {
    const hook = await connect({ config: seriesScene() });
    act(() => tell({ step: 13 }));
    await waitFor(() => {
      expect(shown(hook).step).toBe(13);
    });

    act(() => {
      hook.result.current.goToScene(
        scene("plain", { layers: [{ id: "stadtplan" }] })
      );
    });
    await waitFor(() => {
      expect(hook.result.current.series).toBeNull();
    });
    act(() => tellNone());
    act(() => {
      hook.result.current.goToScene(scene("t50", seriesScene()));
    });
    await waitFor(() => {
      expect(hook.result.current.series).not.toBeNull();
    });

    // not where the display kept it
    expect(shown(hook)).toEqual({ kind: "own", step: 0 });
    // the display would carry on by itself, so the phone tells it to seek
    await waitFor(() => {
      expect(lastSeries()).toMatchObject({ step: 0, seekAt: NOW });
    });
    hook.unmount();
  });

  it("does the same on its own clock with a display that says nothing", async () => {
    const hook = await connect({ config: seriesScene() });
    vi.setSystemTime(NOW + 6000);

    act(() => {
      hook.result.current.goToScene(
        scene("plain", { layers: [{ id: "stadtplan" }] })
      );
    });
    await waitFor(() => {
      expect(hook.result.current.series).toBeNull();
    });
    act(() => {
      hook.result.current.goToScene(scene("t50", seriesScene()));
    });
    await waitFor(() => {
      expect(hook.result.current.series).not.toBeNull();
    });

    expect(shown(hook)).toEqual({ kind: "own", step: 0 });
    await waitFor(() => {
      expect(lastSeries()).toMatchObject({ step: 0, seekAt: NOW + 6000 });
    });
    hook.unmount();
  });
});

describe("useDisplay presenter", () => {
  const plain: MappingConfig = { layers: [{ id: "stadtplan" }] };
  const aerial: MappingConfig = { layers: [{ id: "luftbild" }] };

  /** the phone, as `me`, following a presenter session that holds `doc` */
  const follow = async (doc: unknown, me: Presenter | null = ME) => {
    relay.presenter = { v: 1, state: doc };
    const hook = renderHook(() => useDisplay(TARGET, NO_SCENES, 0, me));
    await waitFor(() => {
      expect(hook.result.current.connection).toBe("connected");
    });
    return hook;
  };

  const settle = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

  beforeEach(() => {
    relay.writes = [];
  });

  it("takes a show nobody presents, keeping what the display shows", async () => {
    const { result } = await follow({ "*": { config: plain } });

    await waitFor(() => {
      expect(result.current.role).toBe("self");
    });
    expect(relay.writes).toEqual([{ "*": { config: plain }, _presenter: ME }]);
    expect(result.current.presenter).toEqual(ME);
  });

  it("reads a document from a remote that knows no targets as shared", async () => {
    const { result } = await follow({ config: plain });

    await waitFor(() => {
      expect(result.current.role).toBe("self");
    });
    expect(result.current.live).toEqual(plain);
    expect(relay.writes).toEqual([{ config: plain, _presenter: ME }]);
  });

  it("only watches without a name", async () => {
    const { result } = await follow({ "*": { config: plain } }, null);
    await settle();

    expect(result.current.role).toBe("free");
    expect(relay.writes).toEqual([]);
  });

  it("takes a show nobody presents once a name is typed", async () => {
    relay.presenter = { v: 1, state: { "*": { config: plain } } };
    const hook = renderHook(({ me }) => useDisplay(TARGET, NO_SCENES, 0, me), {
      initialProps: { me: null as Presenter | null },
    });
    await waitFor(() => {
      expect(hook.result.current.connection).toBe("connected");
    });
    expect(relay.writes).toEqual([]);

    hook.rerender({ me: ME });

    await waitFor(() => {
      expect(hook.result.current.role).toBe("self");
    });
    expect(relay.writes).toHaveLength(1);
  });

  it("only watches once its name is gone, without an alert", async () => {
    relay.presenter = {
      v: 1,
      state: { "*": { config: plain }, _presenter: ME },
    };
    const hook = renderHook(({ me }) => useDisplay(TARGET, NO_SCENES, 0, me), {
      initialProps: { me: ME as Presenter | null },
    });
    await waitFor(() => {
      expect(hook.result.current.role).toBe("self");
    });

    hook.rerender({ me: null });

    expect(hook.result.current.role).toBe("other");
    expect(hook.result.current.takenOverBy).toBeNull();
  });

  it("watches while somebody else presents, and writes nothing", async () => {
    const { result } = await follow({
      "*": { config: plain },
      _presenter: OTHER,
    });

    expect(result.current.role).toBe("other");
    expect(result.current.presenter).toEqual(OTHER);
    expect(result.current.live).toEqual(plain);
    act(() => {
      result.current.setBlackout(true);
      result.current.goToScene(scene("aerial", aerial));
    });
    await settle();

    expect(relay.writes).toEqual([]);
    expect(result.current.isBlackout).toBe(false);
    expect(result.current.activeSceneId).toBeNull();
  });

  it("follows what the presenter sends while watching", async () => {
    const { result } = await follow({
      "*": { config: plain },
      _presenter: OTHER,
    });

    act(() => writeElsewhere({ "*": { config: aerial }, _presenter: OTHER }));

    await waitFor(() => {
      expect(result.current.live).toEqual(aerial);
    });
    expect(result.current.takenOverBy).toBeNull();
  });

  it("alerts when somebody takes the show over, and stops writing", async () => {
    const { result } = await connect({ config: plain });
    expect(result.current.role).toBe("self");

    act(() => writeElsewhere({ "*": { config: aerial }, _presenter: OTHER }));

    await waitFor(() => {
      expect(result.current.takenOverBy).toEqual(OTHER);
    });
    expect(result.current.role).toBe("other");
    expect(result.current.live).toEqual(aerial);
    act(() => {
      result.current.setBlackout(true);
    });
    await settle();
    expect(relay.writes).toEqual([]);
  });

  it("takes the show back, without the other phone's pointer", async () => {
    const { result } = await connect({ config: plain });
    act(() =>
      writeElsewhere({
        "*": { config: aerial, pointer: { code: "TEST-P" } },
        _presenter: OTHER,
      })
    );
    await waitFor(() => {
      expect(result.current.takenOverBy).toEqual(OTHER);
    });

    act(() => {
      result.current.dismissTakeover();
      result.current.grab();
    });

    await waitFor(() => {
      expect(result.current.role).toBe("self");
    });
    expect(relay.writes).toEqual([{ "*": { config: aerial }, _presenter: ME }]);
    expect(result.current.takenOverBy).toBeNull();
  });

  it("gives way when somebody else wrote first, without overwriting it", async () => {
    const { result } = await connect({ config: plain });
    // a takeover this phone has not heard yet
    writeElsewhere({ "*": { config: aerial }, _presenter: OTHER }, false);

    act(() => {
      result.current.setBlackout(true);
    });

    await waitFor(() => {
      expect(result.current.takenOverBy).toEqual(OTHER);
    });
    expect(relay.writes).toEqual([]);
    expect(result.current.live).toEqual(aerial);
    expect(relay.presenter.state).toEqual({
      "*": { config: aerial },
      _presenter: OTHER,
    });
  });

  it("writes once more on top of a version of its own it missed", async () => {
    const { result } = await connect({ config: plain });
    // the same phone in a second tab
    writeElsewhere({ "*": { config: plain }, _presenter: ME }, false);

    act(() => {
      result.current.setBlackout(true);
    });

    await waitFor(() => {
      expect(relay.writes).toHaveLength(1);
    });
    expect(result.current.role).toBe("self");
    expect(result.current.takenOverBy).toBeNull();
  });
});

describe("useDisplay layer targets", () => {
  const layers = (...ids: string[]): MappingConfig => ({
    layers: ids.map((id) => ({ id })),
  });
  const plain = scene("plain", layers("stadtplan"));
  const marked: ShowScene = {
    ...scene("marked", layers("stadtplan", "maske", "luftbild")),
    layerTargets: { maske: ["outlet"], luftbild: ["geoportal"] },
  };
  const unmarked = scene("unmarked", layers("stadtplan", "maske"));
  const scenes = [plain, marked, unmarked];

  /** the layers the phone's last write gave one section, without the blackout */
  const sectionIds = (key: string) => {
    const section = relay.writes[relay.writes.length - 1]?.[key] as
      | { config?: MappingConfig }
      | undefined;
    return section?.config
      ? baseOf(section.config).layers.map(({ id }) => id)
      : undefined;
  };

  const settle = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

  beforeEach(() => {
    relay.writes = [];
  });

  it("writes the layers marked for one display into that display's section", async () => {
    const { result } = await connect({ config: plain.config }, scenes);

    act(() => {
      result.current.goToScene(marked);
    });
    await waitFor(() => {
      expect(sectionIds("outlet")).toEqual(["stadtplan", "maske"]);
    });
    expect(sectionIds("*")).toEqual(["stadtplan"]);
    expect(sectionIds("geoportal")).toEqual(["stadtplan", "luftbild"]);
  });

  it("drops the marks of the scene it leaves", async () => {
    const { result } = await connect({ config: plain.config }, scenes);
    act(() => {
      result.current.goToScene(marked);
    });
    await waitFor(() => {
      expect(sectionIds("outlet")).toEqual(["stadtplan", "maske"]);
    });

    act(() => {
      result.current.goToScene(unmarked);
    });
    await waitFor(() => {
      expect(sectionIds("*")).toEqual(["stadtplan", "maske"]);
    });
    expect(Object.keys(relay.writes[relay.writes.length - 1] ?? {})).toEqual([
      "*",
      "_presenter",
    ]);
  });

  it("follows a show sent in sections, knowing every layer and the scene", async () => {
    relay.presenter = {
      v: 1,
      state: {
        ...withTargetSections(
          { config: marked.config },
          marked.layerTargets ?? {}
        ),
        _presenter: OTHER,
      },
    };
    const { result } = renderHook(() => useDisplay(TARGET, scenes, 0, ME));
    await waitFor(() => {
      expect(result.current.connection).toBe("connected");
    });

    expect(result.current.live?.layers.map(({ id }) => id).sort()).toEqual([
      "luftbild",
      "maske",
      "stadtplan",
    ]);
    expect(result.current.activeSceneId).toBe("marked");
  });

  it("writes on in the same sections after taking the show over", async () => {
    relay.presenter = {
      v: 1,
      state: {
        ...withTargetSections(
          { config: marked.config },
          marked.layerTargets ?? {}
        ),
        _presenter: OTHER,
      },
    };
    // a show this phone does not know: the marks come from the document
    const { result } = renderHook(() => useDisplay(TARGET, NO_SCENES, 0, ME));
    await waitFor(() => {
      expect(result.current.role).toBe("other");
    });

    act(() => {
      result.current.grab();
    });
    await waitFor(() => {
      expect(result.current.role).toBe("self");
    });
    act(() => {
      result.current.setBlackout(true);
    });
    await settle();

    expect(relay.writes).toHaveLength(2);
    expect(sectionIds("*")).toEqual(["stadtplan"]);
    expect(sectionIds("outlet")).toEqual(["stadtplan", "maske"]);
    expect(sectionIds("geoportal")).toEqual(["stadtplan", "luftbild"]);
  });
});

describe("useDisplay scene", () => {
  const layers = (...ids: string[]): MappingConfig => ({
    layers: ids.map((id) => ({ id })),
  });
  const plain = scene("plain", layers("stadtplan"));
  const other = scene("other", layers("stadtplan", "maske"));
  const scenes = [plain, other];

  const settle = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

  /** the phone takes over a show somebody else sent `shared` for */
  const takeOver = async (
    shared: Record<string, unknown>,
    known: readonly ShowScene[]
  ) => {
    relay.presenter = { v: 1, state: { "*": shared, _presenter: OTHER } };
    const hook = renderHook(() => useDisplay(TARGET, known, 0, ME));
    await waitFor(() => {
      expect(hook.result.current.role).toBe("other");
    });
    act(() => {
      hook.result.current.grab();
    });
    await waitFor(() => {
      expect(hook.result.current.role).toBe("self");
    });
    act(() => {
      hook.result.current.setBlackout(true);
    });
    await settle();
    return hook;
  };

  beforeEach(() => {
    relay.writes = [];
  });

  it("names the live scene in every write, so a display can tell scenes apart without a position", async () => {
    const { result } = await connect({ config: plain.config }, scenes);

    act(() => {
      result.current.goToScene(other);
    });
    await waitFor(() => {
      expect(lastWrite()?.["scene"]).toBe("other");
    });
  });

  it("names the live scene's story and title, for a geoportal's show button", async () => {
    relay.presenter = {
      v: 1,
      state: { "*": { config: plain.config }, _presenter: ME },
    };
    const stories = [{ id: "st", title: "Wuppertal heute" }];
    const { result } = renderHook(() =>
      useDisplay(
        TARGET,
        [plain, { ...other, story: "st", title: "Kitas" }],
        0,
        ME,
        stories
      )
    );
    await waitFor(() => {
      expect(result.current.connection).toBe("connected");
    });

    act(() => {
      result.current.goToScene({ ...other, story: "st", title: "Kitas" });
    });
    await waitFor(() => {
      expect(lastWrite()).toMatchObject({
        scene: "other",
        storyTitle: "Wuppertal heute",
        sceneTitle: "Kitas",
      });
    });
  });

  it("carries on the scene of a show it takes over", async () => {
    await takeOver({ config: plain.config, scene: "unmarked" }, NO_SCENES);

    expect(relay.writes).toHaveLength(2);
    expect(lastWrite()?.["scene"]).toBe("unmarked");
  });

  it("names the scene it recognises in a show that named none", async () => {
    await takeOver({ config: plain.config }, scenes);

    // taking over, the titles the document lacked, the blackout
    expect(relay.writes).toHaveLength(3);
    expect(lastWrite()).toMatchObject({ scene: "plain", sceneTitle: "plain" });
  });

  it("names the scene it recognises once the show arrives after the document", async () => {
    relay.presenter = {
      v: 1,
      state: { "*": { config: plain.config }, _presenter: OTHER },
    };
    const hook = renderHook(
      ({ known }: { known: readonly ShowScene[] }) =>
        useDisplay(TARGET, known, 0, ME),
      { initialProps: { known: NO_SCENES } }
    );
    await waitFor(() => {
      expect(hook.result.current.role).toBe("other");
    });
    hook.rerender({ known: scenes });
    await waitFor(() => {
      expect(hook.result.current.activeSceneId).toBe("plain");
    });

    act(() => {
      hook.result.current.grab();
    });
    await waitFor(() => {
      expect(hook.result.current.role).toBe("self");
    });
    act(() => {
      hook.result.current.setBlackout(true);
    });
    await settle();

    // taking over, the titles the document lacked, the blackout
    expect(relay.writes).toHaveLength(3);
    expect(lastWrite()).toMatchObject({ scene: "plain", sceneTitle: "plain" });
  });

  it("names a live scene the document has no titles for once, without a tap", async () => {
    await connect({ config: plain.config, scene: "plain" }, scenes);

    await waitFor(() => {
      expect(lastWrite()).toMatchObject({
        scene: "plain",
        storyTitle: "Geschichte 1",
        sceneTitle: "plain",
      });
    });
    await settle();
    expect(relay.writes).toHaveLength(1);
  });
});
