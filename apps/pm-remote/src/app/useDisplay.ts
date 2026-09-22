import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MappingConfig } from "@carma-api";
import {
  DEFAULT_PREPARE_MS,
  baseOf,
  blackoutOf,
  composeDisplayConfig,
  helloRelay,
  isBounds3857,
  isMappingConfig,
  planSceneChange,
  readRelayState,
  withLayerOpacity,
  writeRelayState,
  type Bounds3857,
  type RelayTarget,
  type ShowScene,
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

  const send = useCallback(
    (base: MappingConfig): Promise<void> => {
      liveRef.current = base;
      setLive(base);
      if (!writer) {
        return Promise.reject(new Error("Kein Sitzungscode gesetzt."));
      }
      return reportWrite(
        writer.write({
          config: composeDisplayConfig(base, {
            on: blackoutRef.current,
            fadeMs: BLACKOUT_FADE_MS,
          }),
          ...(boundsRef.current ? { bounds: boundsRef.current } : {}),
        })
      );
    },
    [writer, reportWrite]
  );

  // connect: open the session, then take over what the display was last sent
  useEffect(() => {
    runRef.current += 1;
    liveRef.current = null;
    blackoutRef.current = false;
    boundsRef.current = null;
    setLive(null);
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
  }, [target]);

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

  return {
    connection,
    error,
    live,
    isBlackout,
    activeSceneId,
    isChanging,
    goToScene,
    setLayerOpacity,
    setBlackout,
  };
};
