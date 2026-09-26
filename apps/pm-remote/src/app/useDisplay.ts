import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MappingConfig } from "@carma-api";
import {
  DEFAULT_PREPARE_MS,
  baseOf,
  blackoutOf,
  clampDayOfYear,
  clockShadowDate,
  clockStep,
  composeDisplayConfig,
  findSceneSeries,
  findSceneShadow,
  helloRelay,
  initialShadowClock,
  isBounds3857,
  isMappingConfig,
  isShadowControl,
  isTimeSeriesControl,
  planSceneChange,
  readRelayState,
  seriesControlOf,
  shadowControlOf,
  withLayerOpacity,
  writeRelayState,
  type Bounds3857,
  type PointerChannel,
  type RelayTarget,
  type SceneSeries,
  type SceneShadow,
  type SeriesClock,
  type ShadowClock,
  type ShadowControl,
  type ShadowMoment,
  type ShadowPlay,
  type ShowScene,
  type TimeSeriesControl,
} from "@carma-mapping/show-remote";

import { createLatestWinsWriter, runSteps, sleep } from "./display-link";
import { relayErrorText } from "./messages";

/** the blackout fades rather than cuts, whatever the scene fade is set to */
const BLACKOUT_FADE_MS = 1000;
/** a slider move is smoothed over about one write round trip */
const SLIDER_TRANSITION_MS = 150;
/** the relay keeps a session on the fast poll rate for 60 s after a hello */
const HELLO_INTERVAL_MS = 30_000;

const LOG_PREFIX = "[PM REMOTE]";

export type Connection = "idle" | "connecting" | "connected" | "error";

/**
 * The phone's clock of the time series the live scene runs. `touched` says the
 * presenter used it; only then does it go into the state document, so a scene
 * nobody steers leaves the series to its layer's own autoplay.
 */
type OwnSeries = { key: string; clock: SeriesClock; touched: boolean };

/** the series' entry of a write, when the presenter steered the one it runs */
const seriesEntry = (
  own: OwnSeries | null,
  base: MappingConfig | null
): { timeSeries?: TimeSeriesControl } => {
  if (!own?.touched) {
    return {};
  }
  const series = findSceneSeries(base);
  return series?.key === own.key
    ? { timeSeries: seriesControlOf(own.clock, series, Date.now()) }
    : {};
};

/** The phone's clock of the shadows the live scene casts, like `OwnSeries`. */
type OwnShadow = { key: string; clock: ShadowClock; touched: boolean };

/** the shadows' entry of a write, when the presenter steered the ones it casts */
const shadowEntry = (
  own: OwnShadow | null,
  base: MappingConfig | null
): { shadow?: ShadowControl } => {
  if (!own?.touched) {
    return {};
  }
  const shadow = findSceneShadow(base);
  return shadow?.key === own.key
    ? { shadow: shadowControlOf(own.clock, shadow, Date.now()) }
    : {};
};

/** the scene the display shows, told apart by its layers */
const sceneShowing = (
  live: MappingConfig,
  scenes: readonly ShowScene[]
): ShowScene | undefined => {
  const ids = live.layers.map(({ id }) => id).join("\n");
  return scenes.find(
    ({ config }) => config.layers.map(({ id }) => id).join("\n") === ids
  );
};

/**
 * The remote's side of one display session. `live` is what the remote last
 * sent, without the blackout layer: the phone never hears back from the
 * display, so this is the best knowledge there is of what is on screen.
 */
export const useDisplay = (
  target: RelayTarget | null,
  scenes: readonly ShowScene[],
  fadeMs: number
) => {
  const [connection, setConnection] = useState<Connection>("idle");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<MappingConfig | null>(null);
  const [isBlackout, setIsBlackout] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  const liveRef = useRef<MappingConfig | null>(null);
  const blackoutRef = useRef(false);
  /**
   * The position the display was last sent. Every write repeats it, since the
   * state document is the whole desired state: a scene without a position
   * keeps the display where it is instead of dropping it back to its default.
   */
  const boundsRef = useRef<Bounds3857 | null>(null);
  /** the open pointer session, repeated in every write like the position */
  const pointerRef = useRef<PointerChannel | null>(null);
  /** the series clock, repeated in every write like the position */
  const seriesRef = useRef<OwnSeries | null>(null);
  const [seriesClock, setSeriesClock] = useState<SeriesClock | null>(null);
  /** the shadows' clock, repeated in every write like the series */
  const shadowRef = useRef<OwnShadow | null>(null);
  const [shadowClock, setShadowClock] = useState<ShadowClock | null>(null);
  // bumped by every scene tap; a run whose number is outdated stops
  const runRef = useRef(0);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  const writer = useMemo(
    () =>
      target
        ? createLatestWinsWriter(async (state) => {
            await writeRelayState(target, state);
          })
        : null,
    [target]
  );

  const reportWrite = useCallback((promise: Promise<void>) => {
    promise.then(
      () => {
        setConnection("connected");
        setError(null);
      },
      (writeError: unknown) => {
        console.warn(`${LOG_PREFIX} write failed`, writeError);
        setConnection("error");
        setError(relayErrorText(writeError));
      }
    );
    return promise;
  }, []);

  /**
   * The whole state document. Without a known configuration it leaves the
   * config out, which the display reads as "keep what you show".
   */
  const write = useCallback(
    (base: MappingConfig | null): Promise<void> => {
      if (!writer) {
        return Promise.reject(new Error("Kein Sitzungscode gesetzt."));
      }
      return reportWrite(
        writer.write({
          ...(base
            ? {
                config: composeDisplayConfig(base, {
                  on: blackoutRef.current,
                  fadeMs: BLACKOUT_FADE_MS,
                }),
              }
            : {}),
          ...(boundsRef.current ? { bounds: boundsRef.current } : {}),
          ...(pointerRef.current ? { pointer: pointerRef.current } : {}),
          ...seriesEntry(seriesRef.current, base),
          ...shadowEntry(shadowRef.current, base),
        })
      );
    },
    [writer, reportWrite]
  );

  /**
   * Follows the series of what the display is sent. A scene running another
   * series, or none, drops the clock; the display starts that one as its layer
   * says. The same series in the next scene keeps it, since the display keeps
   * running it too.
   */
  const trackSeries = useCallback((base: MappingConfig | null) => {
    const series = findSceneSeries(base);
    if (series?.key === seriesRef.current?.key) {
      return;
    }
    seriesRef.current = series
      ? {
          key: series.key,
          clock: {
            step: series.initialStep,
            playing: series.autoplay,
            since: Date.now(),
          },
          touched: false,
        }
      : null;
    setSeriesClock(seriesRef.current?.clock ?? null);
  }, []);

  /**
   * The same for the shadows. Other shadows, or the same ones from another
   * start moment, start over as the display starts them; the other bridge of
   * the same moment keeps the clock, as the display keeps casting them.
   */
  const trackShadow = useCallback((base: MappingConfig | null) => {
    const shadow = findSceneShadow(base);
    if (shadow?.key === shadowRef.current?.key) {
      return;
    }
    shadowRef.current = shadow
      ? {
          key: shadow.key,
          clock: initialShadowClock(shadow, Date.now()),
          touched: false,
        }
      : null;
    setShadowClock(shadowRef.current?.clock ?? null);
  }, []);

  const send = useCallback(
    (base: MappingConfig): Promise<void> => {
      liveRef.current = base;
      setLive(base);
      trackSeries(base);
      trackShadow(base);
      return write(base);
    },
    [write, trackSeries, trackShadow]
  );

  // connect: open the session, then take over what the display was last sent
  useEffect(() => {
    runRef.current += 1;
    liveRef.current = null;
    blackoutRef.current = false;
    boundsRef.current = null;
    pointerRef.current = null;
    seriesRef.current = null;
    shadowRef.current = null;
    setLive(null);
    setSeriesClock(null);
    setShadowClock(null);
    setIsBlackout(false);
    setActiveSceneId(null);
    setIsChanging(false);
    if (!target) {
      setConnection("idle");
      setError(null);
      return;
    }
    let isCurrent = true;
    setConnection("connecting");
    setError(null);
    (async () => {
      // the hello opens a session nobody wrote to yet; a read alone would not
      await helloRelay(target);
      const { state } = await readRelayState(target);
      if (!isCurrent) {
        return;
      }
      const document =
        typeof state === "object" && state !== null
          ? (state as Record<string, unknown>)
          : {};
      const config = document["config"];
      const bounds = document["bounds"];
      if (isBounds3857(bounds)) {
        boundsRef.current = bounds;
      }
      if (isMappingConfig(config)) {
        const base = baseOf(config);
        liveRef.current = base;
        blackoutRef.current = blackoutOf(config) ?? false;
        setLive(base);
        setIsBlackout(blackoutRef.current);
        setActiveSceneId(sceneShowing(base, scenesRef.current)?.id ?? null);
        trackSeries(base);
        // where the series was steered to before this phone (re)connected;
        // counted on from now, the time in between is not known
        const control = document["timeSeries"];
        if (seriesRef.current && isTimeSeriesControl(control)) {
          seriesRef.current = {
            key: seriesRef.current.key,
            clock: { ...control, since: Date.now() },
            touched: true,
          };
          setSeriesClock(seriesRef.current.clock);
        }
        // the same for the shadows
        trackShadow(base);
        const shadowControl = document["shadow"];
        if (shadowRef.current && isShadowControl(shadowControl)) {
          const { year } = shadowRef.current.clock.date;
          shadowRef.current = {
            key: shadowRef.current.key,
            clock: {
              date: {
                year,
                dayOfYear: clampDayOfYear(year, shadowControl.dayOfYear),
                minutes: shadowControl.minutes,
              },
              play: shadowControl.play,
              cycleSeconds: shadowControl.cycleSeconds,
              since: Date.now(),
              ...(shadowControl.seekAt !== undefined
                ? { seekAt: shadowControl.seekAt }
                : {}),
            },
            touched: true,
          };
          setShadowClock(shadowRef.current.clock);
        }
      }
      setConnection("connected");
    })().catch((connectError: unknown) => {
      if (isCurrent) {
        setConnection("error");
        setError(relayErrorText(connectError));
      }
    });

    const hello = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        helloRelay(target).catch((helloError: unknown) => {
          console.warn(`${LOG_PREFIX} hello failed`, helloError);
        });
      }
    }, HELLO_INTERVAL_MS);
    return () => {
      isCurrent = false;
      window.clearInterval(hello);
    };
  }, [target, trackSeries, trackShadow]);

  // the show often arrives after the display state; find the live scene then
  useEffect(() => {
    if (live) {
      setActiveSceneId(
        (current) => current ?? sceneShowing(live, scenes)?.id ?? null
      );
    }
  }, [live, scenes]);

  const goToScene = useCallback(
    (scene: ShowScene) => {
      const run = ++runRef.current;
      setActiveSceneId(scene.id);
      setIsChanging(true);
      // the first write of the change carries it, so the flight starts with the fade
      if (scene.bounds) {
        boundsRef.current = scene.bounds;
      }
      const steps = planSceneChange(liveRef.current, scene.config, {
        fadeMs,
        prepareMs: DEFAULT_PREPARE_MS,
      });
      runSteps(steps, {
        apply: send,
        sleep,
        isCancelled: () => runRef.current !== run,
      })
        .catch(() => {
          // already reported by `send`; the scene stays where the write left it
        })
        .finally(() => {
          if (runRef.current === run) {
            setIsChanging(false);
          }
        });
    },
    [fadeMs, send]
  );

  const setLayerOpacity = useCallback(
    (id: string, opacity: number) => {
      const current = liveRef.current;
      if (!current || isChanging) {
        return;
      }
      send(withLayerOpacity(current, id, opacity, SLIDER_TRANSITION_MS)).catch(
        () => {
          // reported by `send`
        }
      );
    },
    [isChanging, send]
  );

  const setBlackout = useCallback(
    (on: boolean) => {
      const current = liveRef.current;
      // without a known configuration the write would replace the display's
      // content with the black layer alone
      if (!current) {
        return;
      }
      blackoutRef.current = on;
      setIsBlackout(on);
      send(current).catch(() => {
        // reported by `send`
      });
    },
    [send]
  );

  /** tells the display to follow the pointer session, or to stop following it */
  const setPointerChannel = useCallback(
    (channel: PointerChannel | null): Promise<void> => {
      pointerRef.current = channel;
      return write(liveRef.current);
    },
    [write]
  );

  /** a new clock for the live scene's series, sent to the display */
  const steerSeries = useCallback(
    (
      change: (
        clock: SeriesClock,
        series: SceneSeries,
        now: number
      ) => SeriesClock
    ) => {
      const series = findSceneSeries(liveRef.current);
      const own = seriesRef.current;
      if (!series || own?.key !== series.key) {
        return;
      }
      const clock = change(own.clock, series, Date.now());
      seriesRef.current = { key: own.key, clock, touched: true };
      setSeriesClock(clock);
      write(liveRef.current).catch(() => {
        // reported by `write`
      });
    },
    [write]
  );

  /** play or pause; the display pauses where it is, not where the clock is */
  const setSeriesPlaying = useCallback(
    (playing: boolean) =>
      steerSeries((clock, series, now) => ({
        ...clock,
        step: clockStep(clock, series, now),
        playing,
        since: now,
      })),
    [steerSeries]
  );

  /** puts the display on this step, playing on from there if it plays */
  const seekSeries = useCallback(
    (step: number) =>
      steerSeries((clock, _series, now) => ({
        ...clock,
        step,
        since: now,
        // a new value for every move, so the display takes each one
        seekAt: Math.max(now, (clock.seekAt ?? 0) + 1),
      })),
    [steerSeries]
  );

  /** a new clock for the live scene's shadows, sent to the display */
  const steerShadow = useCallback(
    (
      change: (
        clock: ShadowClock,
        shadow: SceneShadow,
        now: number
      ) => ShadowClock
    ) => {
      const shadow = findSceneShadow(liveRef.current);
      const own = shadowRef.current;
      if (!shadow || own?.key !== shadow.key) {
        return;
      }
      const clock = change(own.clock, shadow, Date.now());
      shadowRef.current = { key: own.key, clock, touched: true };
      setShadowClock(clock);
      write(liveRef.current).catch(() => {
        // reported by `write`
      });
    },
    [write]
  );

  /** play the day or the year, or stop; the display stops where it is */
  const setShadowPlay = useCallback(
    (play: ShadowPlay | null) =>
      steerShadow((clock, shadow, now) => ({
        ...clock,
        date: clockShadowDate(clock, shadow, now),
        play,
        since: now,
      })),
    [steerShadow]
  );

  /** puts the display on this date or time, playing on from there if it plays */
  const seekShadow = useCallback(
    (moment: Partial<Pick<ShadowMoment, "dayOfYear" | "minutes">>) =>
      steerShadow((clock, shadow, now) => ({
        ...clock,
        date: { ...clockShadowDate(clock, shadow, now), ...moment },
        since: now,
        // a new value for every move, so the display takes each one
        seekAt: Math.max(now, (clock.seekAt ?? 0) + 1),
      })),
    [steerShadow]
  );

  /** how long one pass of the playback takes */
  const setShadowCycle = useCallback(
    (cycleSeconds: number) =>
      steerShadow((clock, shadow, now) => ({
        ...clock,
        date: clockShadowDate(clock, shadow, now),
        cycleSeconds,
        since: now,
      })),
    [steerShadow]
  );

  const series = useMemo(() => findSceneSeries(live), [live]);
  const shadow = useMemo(() => findSceneShadow(live), [live]);

  return {
    connection,
    error,
    live,
    series,
    seriesClock,
    setSeriesPlaying,
    seekSeries,
    shadow,
    shadowClock,
    setShadowPlay,
    seekShadow,
    setShadowCycle,
    isBlackout,
    activeSceneId,
    isChanging,
    goToScene,
    setLayerOpacity,
    setBlackout,
    setPointerChannel,
  };
};
