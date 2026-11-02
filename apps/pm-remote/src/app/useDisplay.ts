import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MappingConfig } from "@carma-api";
import {
  DEFAULT_PREPARE_MS,
  DEFAULT_SURFACE,
  RelayError,
  SERIES_STATUS_STALE_MS,
  SHARED_TARGET,
  anchorSeriesClock,
  baseOf,
  blackoutOf,
  clampDayOfYear,
  clampTrafficOffset,
  clockShadowDate,
  composeDisplayConfig,
  displayInfoTarget,
  enteredSeriesClock,
  findSceneSeries,
  followedSeriesControl,
  findSceneShadow,
  findSceneTraffic,
  helloRelay,
  highlightSpotsOf,
  initialShadowClock,
  isBounds3857,
  isHighlightSpots,
  isMappingConfig,
  isShadowControl,
  isSnapshot,
  isTimeSeriesControl,
  isTrafficControl,
  planSceneChange,
  presenterOf,
  presenterRole,
  readRelayState,
  resolveTargets,
  sceneHighlights,
  seriesView,
  shadowControlOf,
  snapshotTarget,
  subscribeRelay,
  surfaceOf,
  withLayerOpacity,
  withPresenter,
  writeRelayState,
  type Bounds3857,
  type HeardSeriesStatus,
  type HighlightSpot,
  type LeftSeries,
  type PointerChannel,
  type Presenter,
  type PresenterRole,
  type RelayReadResult,
  type RelayTarget,
  type SceneSeries,
  type SceneShadow,
  type SeriesClock,
  type ShadowClock,
  type ShadowControl,
  type ShadowMoment,
  type ShadowPlay,
  type ShowScene,
  type Snapshot,
  type SnapshotRequest,
  type Surface,
  type TimeSeriesControl,
  type TrafficControl,
} from "@carma-mapping/show-remote";

import { createLatestWinsWriter, runSteps, sleep } from "./display-link";
import { RELAY_UNREACHABLE_TEXT, relayErrorText } from "./messages";
import { followSeriesStatus } from "./series-status-link";

/** the blackout fades rather than cuts, whatever the scene fade is set to */
const BLACKOUT_FADE_MS = 1000;
/** a slider move is smoothed over about one write round trip */
const SLIDER_TRANSITION_MS = 150;
/** the relay keeps a session on the fast poll rate for 60 s after a hello */
const HELLO_INTERVAL_MS = 30_000;
/** a display that has not answered by then is not drawing, or not there */
const SNAPSHOT_WAIT_MS = 8000;
const SNAPSHOT_POLL_MS = 400;
/** how often taking the session starts over when somebody else wrote first */
const TAKE_ATTEMPTS = 3;

const LOG_PREFIX = "[PM REMOTE]";

/** a write this phone may not make: somebody else presents */
class NotPresentingError extends Error {
  constructor() {
    super("Jemand anderes präsentiert gerade.");
    this.name = "NotPresentingError";
  }
}

/** what the session held when a write naming an older version came too late */
const conflictOf = (error: unknown): RelayReadResult | undefined =>
  error instanceof RelayError && error.status === 409
    ? error.current
    : undefined;

/** what every display of a presenter session's document shows, if anything */
const sharedOf = (doc: unknown): Record<string, unknown> | null => {
  const shared = resolveTargets(doc, []);
  return shared && Object.keys(shared).length > 0 ? shared : null;
};

const withoutKey = (
  section: Record<string, unknown>,
  key: string
): Record<string, unknown> => {
  const copy = { ...section };
  delete copy[key];
  return copy;
};

/**
 * The document without its pointer session: that one lives on the phone that
 * opened it, so a phone taking the show over drops it.
 */
const withoutPointer = (doc: unknown): unknown => {
  if (typeof doc !== "object" || doc === null) {
    return doc;
  }
  const record = doc as Record<string, unknown>;
  if (!Object.hasOwn(record, SHARED_TARGET)) {
    return withoutKey(record, "pointer");
  }
  const shared = record[SHARED_TARGET];
  return typeof shared === "object" && shared !== null
    ? {
        ...record,
        [SHARED_TARGET]: withoutKey(
          shared as Record<string, unknown>,
          "pointer"
        ),
      }
    : record;
};

/**
 * What the display says it is, a table unless it says otherwise. The hello
 * opens the session first: reading one nobody opened counts as guessing.
 */
const readSurface = async (target: RelayTarget): Promise<Surface> => {
  const info = displayInfoTarget(target);
  await helloRelay(info);
  const { state } = await readRelayState(info);
  return surfaceOf(state);
};

export type Connection = "idle" | "connecting" | "connected" | "error";

/**
 * The phone's clock of the time series the live scene runs. `touched` says the
 * presenter used it; only then does it go into the state document, so a scene
 * nobody steers leaves the series to its layer's own autoplay.
 */
type OwnSeries = {
  key: string;
  series: SceneSeries;
  clock: SeriesClock;
  touched: boolean;
};

/**
 * The series' entry of a write, when the presenter steered the one it runs,
 * at the step the slider shows: the display's, once it tells.
 */
const seriesEntry = (
  own: OwnSeries | null,
  base: MappingConfig | null,
  heard: HeardSeriesStatus | null
): { timeSeries?: TimeSeriesControl } => {
  if (!own?.touched) {
    return {};
  }
  const series = findSceneSeries(base);
  return series?.key === own.key
    ? {
        timeSeries: followedSeriesControl(own.clock, series, heard, Date.now()),
      }
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

/**
 * The stored highlights that are on, and the scene they belong to: the ids
 * only mean something there. A scene change drops them, and once the new
 * scene is there all of its own come on.
 */
export type LitHighlights = { sceneId: string; on: readonly string[] };

/** the highlights' entry of a write: the lit spots of their scene */
const highlightsEntry = (
  lit: LitHighlights | null,
  scenes: readonly ShowScene[]
): { highlights?: HighlightSpot[] } => {
  if (!lit || lit.on.length === 0) {
    return {};
  }
  const scene = scenes.find(({ id }) => id === lit.sceneId);
  const spots = scene ? highlightSpotsOf(sceneHighlights(scene), lit.on) : [];
  return spots.length > 0 ? { highlights: spots } : {};
};

/**
 * The phone's wish for the traffic the live scene runs, like `OwnSeries`: how
 * far back from now the display shows it. Only a touched one goes into the
 * state document; untouched, the display runs the traffic live.
 */
type OwnTraffic = { key: string; control: TrafficControl; touched: boolean };

/** the traffic's entry of a write, when the presenter steered the one it runs */
const trafficEntry = (
  own: OwnTraffic | null,
  base: MappingConfig | null
): { traffic?: TrafficControl } =>
  own?.touched && findSceneTraffic(base)?.key === own.key
    ? { traffic: own.control }
    : {};

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

/** the stored highlights of `scene` among `ids`, lit as the phone shows them */
const litOf = (
  scene: ShowScene,
  ids: readonly string[]
): LitHighlights | null => {
  const known = new Set(sceneHighlights(scene).map(({ id }) => id));
  const on = ids.filter((id) => known.has(id));
  return on.length > 0 ? { sceneId: scene.id, on } : null;
};

/**
 * The remote's side of one display session. `live` is what the remote last
 * sent, without the blackout layer: the phone never hears back from the
 * display, so this is the best knowledge there is of what is on screen.
 *
 * Only the presenter writes (`role` is `self`). Every other phone with the
 * same code watches: it follows what the presenter sends and can take the
 * show over (`grab`). `me` is null until the phone has a name, and a phone
 * without one only watches.
 */
export const useDisplay = (
  target: RelayTarget | null,
  scenes: readonly ShowScene[],
  fadeMs: number,
  me: Presenter | null
) => {
  const [connection, setConnection] = useState<Connection>("idle");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<MappingConfig | null>(null);
  const [isBlackout, setIsBlackout] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [surface, setSurface] = useState<Surface>(DEFAULT_SURFACE);
  const targetRef = useRef(target);
  targetRef.current = target;

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
  /** the last picture asked for, repeated like the position; the display takes each id once */
  const snapshotRef = useRef<SnapshotRequest | null>(null);
  /** the series clock, repeated in every write like the position */
  const seriesRef = useRef<OwnSeries | null>(null);
  const [seriesClock, setSeriesClock] = useState<SeriesClock | null>(null);
  /** the series that went off last, which the display keeps where it was */
  const leftSeriesRef = useRef<LeftSeries | null>(null);
  /** what the display last said about its series, while that is current */
  const heardSeriesRef = useRef<HeardSeriesStatus | null>(null);
  const [seriesStatus, setSeriesStatus] = useState<HeardSeriesStatus | null>(
    null
  );
  /** the shadows' clock, repeated in every write like the series */
  const shadowRef = useRef<OwnShadow | null>(null);
  const [shadowClock, setShadowClock] = useState<ShadowClock | null>(null);
  /** the traffic's offset, repeated in every write like the series */
  const trafficRef = useRef<OwnTraffic | null>(null);
  const [trafficControl, setTrafficControl] = useState<TrafficControl | null>(
    null
  );
  /** the lit highlights, repeated in every write like the position */
  const highlightsRef = useRef<LitHighlights | null>(null);
  const [litHighlights, setLitHighlights] = useState<LitHighlights | null>(
    null
  );
  /**
   * Highlights the display had on when this phone connected, waiting for the
   * show to say which scene is live: the ids only count there.
   */
  const pendingHighlightIdsRef = useRef<string[] | null>(null);
  // bumped by every scene tap; a run whose number is outdated stops
  const runRef = useRef(0);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const meRef = useRef(me);
  meRef.current = me;

  const [role, setRole] = useState<PresenterRole>("free");
  const roleRef = useRef<PresenterRole>("free");
  /** who presents, this phone included */
  const [presenter, setPresenter] = useState<Presenter | null>(null);
  /** who took the show from this phone, until the alert is dismissed */
  const [takenOverBy, setTakenOverBy] = useState<Presenter | null>(null);
  /** the presenter session's newest version this phone knows; its writes replace that one */
  const knownVRef = useRef<number | null>(null);
  /** the presenter session's document at that version */
  const docRef = useRef<unknown>(null);
  /** a write taking the session is out; another one would only collide with it */
  const isTakingRef = useRef(false);

  /**
   * What every display shows, as this phone knows it. Without a known
   * configuration it leaves the config out, which the display reads as "keep
   * what you show".
   */
  const compose = useCallback(
    (base: MappingConfig | null): Record<string, unknown> => ({
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
      ...(snapshotRef.current ? { snapshot: snapshotRef.current } : {}),
      ...seriesEntry(seriesRef.current, base, heardSeriesRef.current),
      ...shadowEntry(shadowRef.current, base),
      ...highlightsEntry(highlightsRef.current, scenesRef.current),
      ...trafficEntry(trafficRef.current, base),
    }),
    []
  );

  /**
   * Follows the series of what the display is sent. A scene running another
   * series, or none, drops the clock and remembers where the series was left;
   * the one that comes on starts as `enteredSeriesClock` says, which for the
   * series left last is where the display kept it. The same series in the next
   * scene keeps the clock, since the display keeps running it too.
   */
  const trackSeries = useCallback((base: MappingConfig | null) => {
    const series = findSceneSeries(base);
    const own = seriesRef.current;
    if (series?.key === own?.key) {
      return;
    }
    const now = Date.now();
    if (own) {
      leftSeriesRef.current = {
        key: own.key,
        step: seriesView(own.clock, own.series, heardSeriesRef.current, now)
          .step,
      };
    }
    heardSeriesRef.current = null;
    setSeriesStatus(null);
    seriesRef.current = series
      ? {
          key: series.key,
          series,
          ...enteredSeriesClock(series, leftSeriesRef.current, now),
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

  /**
   * The same for the traffic. The same network in the next scene keeps the
   * offset, as the display keeps running it; another one starts live, or where
   * its layer says.
   */
  const trackTraffic = useCallback((base: MappingConfig | null) => {
    const traffic = findSceneTraffic(base);
    if (traffic?.key === trafficRef.current?.key) {
      return;
    }
    trafficRef.current = traffic
      ? {
          key: traffic.key,
          control: { offsetMinutes: traffic.initialOffsetMinutes ?? 0 },
          touched: false,
        }
      : null;
    setTrafficControl(trafficRef.current?.control ?? null);
  }, []);

  /**
   * Takes over what the presenter session holds: on connecting, and on every
   * version while somebody else presents. An empty document changes nothing,
   * as for a relay that restarted while the display kept showing.
   */
  const adopt = useCallback(
    (doc: unknown) => {
      const shared = sharedOf(doc);
      if (!shared) {
        return;
      }
      const config = shared["config"];
      const bounds = shared["bounds"];
      const highlights = shared["highlights"];
      boundsRef.current = isBounds3857(bounds) ? bounds : null;
      let scene: ShowScene | undefined;
      if (isMappingConfig(config)) {
        const base = baseOf(config);
        liveRef.current = base;
        blackoutRef.current = blackoutOf(config) ?? false;
        setLive(base);
        setIsBlackout(blackoutRef.current);
        scene = sceneShowing(base, scenesRef.current);
        // a step of a scene change matches no scene; the one it leaves stays
        setActiveSceneId((current) => scene?.id ?? current);
        trackSeries(base);
        // where the series was steered to before this phone heard it;
        // counted on from now, the time in between is not known
        const control = shared["timeSeries"];
        if (seriesRef.current && isTimeSeriesControl(control)) {
          seriesRef.current = {
            ...seriesRef.current,
            clock: { ...control, since: Date.now() },
            touched: true,
          };
          setSeriesClock(seriesRef.current.clock);
        }
        // the same for the shadows
        trackShadow(base);
        const shadowControl = shared["shadow"];
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
        // and the traffic's offset
        trackTraffic(base);
        const trafficControl = shared["traffic"];
        if (trafficRef.current && isTrafficControl(trafficControl)) {
          trafficRef.current = {
            key: trafficRef.current.key,
            control: trafficControl,
            touched: true,
          };
          setTrafficControl(trafficControl);
        }
      }
      // the highlights' ids only count in their scene; one not known yet
      // (the show often arrives later) waits for it, see below
      const ids =
        isHighlightSpots(highlights) && highlights.length > 0
          ? highlights.map(({ id }) => id)
          : [];
      pendingHighlightIdsRef.current = ids.length > 0 && !scene ? ids : null;
      if (ids.length === 0 || scene) {
        highlightsRef.current = scene ? litOf(scene, ids) : null;
        setLitHighlights(highlightsRef.current);
      }
    },
    [trackSeries, trackShadow, trackTraffic]
  );

  /** a version of the presenter session; a relay that restarted counts from 0 again */
  const noteVersion = useCallback((v: number, first = false) => {
    if (first || knownVRef.current === null || v > knownVRef.current) {
      knownVRef.current = v;
    }
  }, []);

  /** who presents according to `doc`, and the alert when it stopped being this phone */
  const settleRole = useCallback((doc: unknown) => {
    const holder = presenterOf(doc);
    const own = meRef.current;
    const next: PresenterRole = own
      ? presenterRole(doc, own.device)
      : holder
      ? "other"
      : "free";
    if (roleRef.current === "self" && next !== "self") {
      // a scene change under way stops; its next write would be refused
      runRef.current += 1;
      setIsChanging(false);
      // a phone that dropped its name stops without an alert
      if (next === "other" && own) {
        setTakenOverBy(holder);
      }
    } else if (next === "self") {
      setTakenOverBy(null);
    }
    roleRef.current = next;
    setRole(next);
    setPresenter(holder);
  }, []);

  /** a version of the presenter session this phone did not write */
  const hear = useCallback(
    (doc: unknown, v: number, first: boolean) => {
      noteVersion(v, first);
      docRef.current = doc;
      settleRole(doc);
      if (first || roleRef.current !== "self") {
        adopt(doc);
      }
    },
    [noteVersion, settleRole, adopt]
  );

  const reportWrite = useCallback((promise: Promise<void>) => {
    promise.then(
      () => {
        setConnection("connected");
        setError(null);
      },
      (writeError: unknown) => {
        // the takeover alert says it
        if (writeError instanceof NotPresentingError) {
          return;
        }
        console.warn(`${LOG_PREFIX} write failed`, writeError);
        setConnection("error");
        setError(relayErrorText(writeError));
      }
    );
    return promise;
  }, []);

  /**
   * Writes replace the version this phone knows (`ifV`), so a takeover in
   * between is never overwritten: the relay refuses, and the phone watches.
   * A refusal for any other reason (a version this phone missed) is tried
   * once more on top of what the session holds.
   */
  const writer = useMemo(
    () =>
      target
        ? createLatestWinsWriter(async (state) => {
            let ifV = knownVRef.current;
            for (let attempt = 0; ; attempt++) {
              const own = meRef.current;
              if (!own || roleRef.current !== "self") {
                throw new NotPresentingError();
              }
              const doc = withPresenter({ [SHARED_TARGET]: state }, own);
              try {
                const { v } = await writeRelayState(
                  target,
                  doc,
                  undefined,
                  ifV ?? undefined
                );
                if (targetRef.current === target) {
                  noteVersion(v);
                  docRef.current = doc;
                }
                return;
              } catch (writeError) {
                const current = conflictOf(writeError);
                if (!current || targetRef.current !== target) {
                  throw writeError;
                }
                if (presenterRole(current.state, own.device) === "other") {
                  hear(current.state, current.v, false);
                  throw new NotPresentingError();
                }
                if (attempt > 0) {
                  throw writeError;
                }
                ifV = current.v;
              }
            }
          })
        : null,
    [target, noteVersion, hear]
  );

  /** the whole state document, written only by the presenter */
  const write = useCallback(
    (base: MappingConfig | null): Promise<void> => {
      if (!writer) {
        return Promise.reject(new Error("Kein Sitzungscode gesetzt."));
      }
      if (roleRef.current !== "self") {
        return Promise.reject(new NotPresentingError());
      }
      return reportWrite(writer.write(compose(base)));
    },
    [writer, reportWrite, compose]
  );

  const send = useCallback(
    (base: MappingConfig): Promise<void> => {
      liveRef.current = base;
      setLive(base);
      trackSeries(base);
      trackShadow(base);
      trackTraffic(base);
      return write(base);
    },
    [write, trackSeries, trackShadow, trackTraffic]
  );

  /**
   * Writes this phone into the presenter session as its presenter, on top of
   * what the session holds (`prepare` adjusts that first). `force` takes it
   * from somebody else; without it the phone gives way to whoever got there
   * first.
   */
  const take = useCallback(
    async (prepare: (doc: unknown) => unknown, force: boolean) => {
      const own = meRef.current;
      const current = targetRef.current;
      if (!own || !current || isTakingRef.current) {
        return;
      }
      isTakingRef.current = true;
      let doc = docRef.current;
      let ifV = knownVRef.current;
      let lastError: unknown = null;
      try {
        for (let attempt = 0; attempt < TAKE_ATTEMPTS; attempt++) {
          const next = withPresenter(prepare(doc), own);
          try {
            const { v } = await writeRelayState(
              current,
              next,
              undefined,
              ifV ?? undefined
            );
            if (targetRef.current === current) {
              noteVersion(v);
              docRef.current = next;
              settleRole(next);
            }
            return;
          } catch (takeError) {
            const conflict = conflictOf(takeError);
            if (!conflict || targetRef.current !== current) {
              throw takeError;
            }
            lastError = takeError;
            hear(conflict.state, conflict.v, false);
            if (!force && roleRef.current !== "free") {
              return;
            }
            doc = conflict.state;
            ifV = conflict.v;
          }
        }
        throw lastError;
      } finally {
        isTakingRef.current = false;
      }
    },
    [noteVersion, settleRole, hear]
  );

  /**
   * Nobody presents: the first phone with a name takes the show, on top of
   * what the display shows. After a relay restart the session is empty while
   * the display kept showing, so a phone that presented writes what it knows.
   */
  const claim = useCallback(() => {
    reportWrite(
      take(
        (doc) =>
          !sharedOf(doc) && liveRef.current
            ? { [SHARED_TARGET]: compose(liveRef.current) }
            : doc,
        false
      )
    ).catch(() => {
      // reported by `reportWrite`
    });
  }, [reportWrite, take, compose]);

  /** takes the show from whoever presents, at once; also "take it back" */
  const grab = useCallback(() => {
    reportWrite(take(withoutPointer, true)).catch(() => {
      // reported by `reportWrite`
    });
  }, [reportWrite, take]);

  const dismissTakeover = useCallback(() => setTakenOverBy(null), []);

  /** ask the display again what it is; a late answer for another code is dropped */
  const refreshSurface = useCallback(() => {
    if (!target) {
      return;
    }
    readSurface(target).then(
      (next) => {
        if (targetRef.current === target) {
          setSurface(next);
        }
      },
      (surfaceError: unknown) => {
        console.warn(`${LOG_PREFIX} reading the surface failed`, surfaceError);
      }
    );
  }, [target]);

  // connect: follow the presenter session, taking over what the display was last sent
  useEffect(() => {
    runRef.current += 1;
    roleRef.current = "free";
    setRole("free");
    setPresenter(null);
    setTakenOverBy(null);
    knownVRef.current = null;
    docRef.current = null;
    liveRef.current = null;
    blackoutRef.current = false;
    boundsRef.current = null;
    pointerRef.current = null;
    seriesRef.current = null;
    leftSeriesRef.current = null;
    heardSeriesRef.current = null;
    setSeriesStatus(null);
    shadowRef.current = null;
    highlightsRef.current = null;
    pendingHighlightIdsRef.current = null;
    setLitHighlights(null);
    trafficRef.current = null;
    setTrafficControl(null);
    setLive(null);
    setSeriesClock(null);
    setShadowClock(null);
    setIsBlackout(false);
    setActiveSceneId(null);
    setIsChanging(false);
    setSurface(DEFAULT_SURFACE);
    if (!target) {
      setConnection("idle");
      setError(null);
      return;
    }
    let isCurrent = true;
    let isConnected = false;
    setConnection("connecting");
    setError(null);
    const subscription = subscribeRelay({
      target,
      onState: (doc, { v, first }) => {
        if (!isCurrent) {
          return;
        }
        const before = roleRef.current;
        hear(doc, v, first);
        if (first) {
          refreshSurface();
        }
        // nobody presents: a phone with a name takes the show, unless it
        // watched somebody else, which waits for a press
        if (roleRef.current === "free" && meRef.current && before !== "other") {
          claim();
        }
      },
      // only the changes count; every long-poll answer reports too
      onStatus: ({ connected }) => {
        if (!isCurrent || connected === isConnected) {
          return;
        }
        isConnected = connected;
        setConnection(connected ? "connected" : "error");
        setError(connected ? null : RELAY_UNREACHABLE_TEXT);
      },
    });

    const hello = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        helloRelay(target).catch((helloError: unknown) => {
          console.warn(`${LOG_PREFIX} hello failed`, helloError);
        });
        // a display started or restarted after the connect says so here
        refreshSurface();
      }
    }, HELLO_INTERVAL_MS);
    return () => {
      isCurrent = false;
      subscription.stop();
      window.clearInterval(hello);
    };
  }, [target, hear, claim, refreshSurface]);

  // a name typed after connecting takes a show nobody presents; a dropped
  // one leaves only watching
  useEffect(() => {
    if (knownVRef.current === null) {
      return;
    }
    settleRole(docRef.current);
    if (me && roleRef.current === "free") {
      claim();
    }
  }, [me, settleRole, claim]);

  // the show often arrives after the display state; find the live scene then
  useEffect(() => {
    if (live) {
      setActiveSceneId(
        (current) => current ?? sceneShowing(live, scenes)?.id ?? null
      );
    }
  }, [live, scenes]);

  // the highlights the display had on belong to the scene found above
  useEffect(() => {
    const pending = pendingHighlightIdsRef.current;
    const scene = scenes.find(({ id }) => id === activeSceneId);
    if (!pending || !scene) {
      return;
    }
    pendingHighlightIdsRef.current = null;
    highlightsRef.current = litOf(scene, pending);
    setLitHighlights(highlightsRef.current);
  }, [activeSceneId, scenes]);

  const goToScene = useCallback(
    (scene: ShowScene) => {
      if (roleRef.current !== "self") {
        return;
      }
      const run = ++runRef.current;
      setActiveSceneId(scene.id);
      setIsChanging(true);
      // the old scene's highlights go off with the first write; the new
      // one's come on once it is there, see below
      highlightsRef.current = null;
      pendingHighlightIdsRef.current = null;
      setLitHighlights(null);
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
        .then(() => {
          // the scene is there: all its highlights come on, so they show
          // without a press, in autoplay too; the buttons switch them off
          const on = sceneHighlights(scene).map(({ id }) => id);
          if (runRef.current !== run || on.length === 0) {
            return;
          }
          highlightsRef.current = { sceneId: scene.id, on };
          setLitHighlights(highlightsRef.current);
          return write(liveRef.current);
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
    [fadeMs, send, write]
  );

  const setLayerOpacity = useCallback(
    (id: string, opacity: number) => {
      const current = liveRef.current;
      if (!current || isChanging || roleRef.current !== "self") {
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
      if (!current || roleRef.current !== "self") {
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

  /**
   * Switches the stored highlights of one button of the live scene on or
   * off, all of them together: off when they are all on, else on. The others
   * stay as they are.
   */
  const toggleHighlight = useCallback(
    (sceneId: string, highlightIds: readonly string[]) => {
      if (roleRef.current !== "self") {
        return;
      }
      const current = highlightsRef.current;
      const on = current?.sceneId === sceneId ? current.on : [];
      const next = highlightIds.every((id) => on.includes(id))
        ? on.filter((id) => !highlightIds.includes(id))
        : [...on, ...highlightIds.filter((id) => !on.includes(id))];
      highlightsRef.current = next.length > 0 ? { sceneId, on: next } : null;
      setLitHighlights(highlightsRef.current);
      write(liveRef.current).catch(() => {
        // reported by `write`
      });
    },
    [write]
  );

  /** tells the display to follow the pointer session, or to stop following it */
  const setPointerChannel = useCallback(
    (channel: PointerChannel | null): Promise<void> => {
      pointerRef.current = channel;
      return write(liveRef.current);
    },
    [write]
  );

  /**
   * A picture of what the display shows now. The display answers in a
   * session of its own, which the hello opens first: reading a session that
   * does not exist counts as guessing at the relay.
   */
  const requestSnapshot = useCallback(async (): Promise<Snapshot> => {
    if (!target) {
      throw new Error("Kein Sitzungscode gesetzt.");
    }
    const answers = snapshotTarget(target);
    await helloRelay(answers);
    const id = Math.max(Date.now(), (snapshotRef.current?.id ?? 0) + 1);
    snapshotRef.current = { id };
    await write(liveRef.current);
    const until = performance.now() + SNAPSHOT_WAIT_MS;
    while (performance.now() < until) {
      await sleep(SNAPSHOT_POLL_MS);
      const { state } = await readRelayState(answers);
      if (isSnapshot(state) && state.id === id) {
        return state;
      }
    }
    throw new Error("Der Projektor hat kein Bild geschickt.");
  }, [target, write]);

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
      if (!series || own?.key !== series.key || roleRef.current !== "self") {
        return;
      }
      const clock = change(own.clock, series, Date.now());
      seriesRef.current = { ...own, clock, touched: true };
      setSeriesClock(clock);
      write(liveRef.current).catch(() => {
        // reported by `write`
      });
    },
    [write]
  );

  /**
   * Play or pause; the display pauses where it is, not where the clock is.
   * Play goes out while the display still loads its frames too: it holds until
   * they are in, and asks again for the ones that failed.
   */
  const setSeriesPlaying = useCallback(
    (playing: boolean) =>
      steerSeries((clock, series, now) => ({
        ...clock,
        step: seriesView(clock, series, heardSeriesRef.current, now).step,
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
      if (!shadow || own?.key !== shadow.key || roleRef.current !== "self") {
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

  /** one change to the live scene's traffic, sent to the display */
  const steerTraffic = useCallback(
    (change: (control: TrafficControl, now: number) => TrafficControl) => {
      const traffic = findSceneTraffic(liveRef.current);
      const own = trafficRef.current;
      if (!traffic || own?.key !== traffic.key || roleRef.current !== "self") {
        return;
      }
      const control = change(own.control, Date.now());
      trafficRef.current = { key: own.key, control, touched: true };
      setTrafficControl(control);
      write(liveRef.current).catch(() => {
        // reported by `write`
      });
    },
    [write]
  );

  /** shows the live scene's traffic this many minutes back; 0 is live */
  const setTrafficOffset = useCallback(
    (minutes: number) =>
      steerTraffic((control, now) => ({
        ...control,
        offsetMinutes: clampTrafficOffset(minutes),
        // a new value for every move, so the display takes each one
        seekAt: Math.max(now, (control.seekAt ?? 0) + 1),
      })),
    [steerTraffic]
  );

  /** throws the display's vehicles away and fills the network anew, same moment */
  const restartTraffic = useCallback(
    () =>
      steerTraffic((control, now) => ({
        ...control,
        restartAt: Math.max(now, (control.restartAt ?? 0) + 1),
      })),
    [steerTraffic]
  );

  const series = useMemo(() => findSceneSeries(live), [live]);
  const seriesKey = series?.key ?? null;

  // what the display says about the series, while the live scene runs one
  useEffect(() => {
    if (!target || !seriesKey) {
      return undefined;
    }
    return followSeriesStatus(target, (heard) => {
      const now = Date.now();
      const current =
        heard &&
        heard.status.key === seriesKey &&
        now - heard.writtenAt < SERIES_STATUS_STALE_MS
          ? heard
          : null;
      heardSeriesRef.current = current;
      setSeriesStatus(current);
      // the phone's clock goes where the display is, to count on from there
      // should the display fall silent
      const own = seriesRef.current;
      if (own && current) {
        const clock = anchorSeriesClock(own.clock, own.series, current, now);
        if (clock !== own.clock) {
          seriesRef.current = { ...own, clock };
          setSeriesClock(clock);
        }
      }
    });
  }, [target, seriesKey]);

  // a status nobody renews is from a display gone quiet: back to the own clock
  useEffect(() => {
    if (!seriesStatus) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (heardSeriesRef.current === seriesStatus) {
        heardSeriesRef.current = null;
        setSeriesStatus(null);
      }
    }, Math.max(0, seriesStatus.writtenAt + SERIES_STATUS_STALE_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [seriesStatus]);

  const traffic = useMemo(() => findSceneTraffic(live), [live]);
  const shadow = useMemo(() => findSceneShadow(live), [live]);

  return {
    connection,
    error,
    live,
    series,
    seriesClock,
    seriesStatus,
    setSeriesPlaying,
    seekSeries,
    shadow,
    shadowClock,
    setShadowPlay,
    seekShadow,
    setShadowCycle,
    traffic,
    trafficControl,
    setTrafficOffset,
    restartTraffic,
    role,
    presenter,
    takenOverBy,
    dismissTakeover,
    grab,
    isBlackout,
    activeSceneId,
    isChanging,
    goToScene,
    litHighlights,
    toggleHighlight,
    setLayerOpacity,
    setBlackout,
    setPointerChannel,
    requestSnapshot,
    surface,
    refreshSurface,
  };
};
