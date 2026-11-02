import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Map as LibreMap, MapLibreEvent } from "maplibre-gl";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import type { carma as carmaApi } from "@carma-api";
import { useMapSelection } from "@carma-mapping/contexts";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import {
  baseOf,
  geoportalViewDocument,
  type Bounds3857,
  type GeoportalView,
} from "@carma-mapping/show-remote";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import type { MapRelayState } from "../MapRelay";
import {
  applyRemoteConfig,
  configIdentity,
  configLabel,
  isRemoteConfig,
} from "../MapRelay/remote-config";
import {
  flightKeyOf,
  followerView,
  frameOfLngLat,
  homeOf,
  lngLatBoundsOf,
  selectedFeatureOf,
  selectionOfFeature,
} from "./relay-follower";

const LOG_PREFIX = "[RELAY FOLLOWER]";
const BACK_LABEL = "Zurück zur Modellansicht";
const DEFAULT_FLY_DURATION_MS = 2000;
/** a flight that never reports landing stops counting as one after this */
const FLIGHT_GRACE_MS = 1500;
/** the outlet forgets a geoportal frame after 90 s, so it is said again well before */
const REPEAT_INTERVAL_MS = 30_000;
const DEFAULT_CONTROL_ORDER = 95;

const NO_VIEW: GeoportalView = { frame: null, selection: null };

/**
 * The geoportal's info box, which this page empties together with its
 * selection. Plain actions of the host's `features` slice
 * (`apps/geoportal/src/app/store/slices/features.ts`), the same three the
 * geoportal sends when it leaves its info mode.
 */
const CLEAR_INFO_BOX_ACTIONS = [
  { type: "features/setSelectedFeature", payload: null },
  { type: "features/setSecondaryInfoBoxElements", payload: [] },
  { type: "features/setFeatures", payload: [] },
] as const;

const frameOfMap = (map: LibreMap): Bounds3857 => {
  const bounds = map.getBounds();
  return frameOfLngLat(
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  );
};

/**
 * What the presenter shows, minus what is not this page's business: its
 * layers (resolved for the page's tags by `mapRelay`) and its base map. The
 * blackout stays on the projection; a geoportal going black would only look
 * broken. A field is applied again only once it changed, so the user's own
 * layer changes last until the show moves on.
 */
const useShowLayers = (
  presenterState: Record<string, unknown> | null | undefined,
  carma: typeof carmaApi
) => {
  const appliedConfigRef = useRef<string | undefined>(undefined);
  const appliedBackgroundRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!presenterState) {
      return;
    }
    const requested = presenterState["config"];
    if (isRemoteConfig(requested)) {
      const wanted =
        typeof requested === "string" || !Array.isArray(requested.layers)
          ? requested
          : baseOf(requested);
      const identity = configIdentity(wanted);
      if (identity !== appliedConfigRef.current) {
        appliedConfigRef.current = identity;
        void applyRemoteConfig(carma, wanted).then((applied) => {
          if (applied) {
            console.debug(`${LOG_PREFIX} applied ${configLabel(wanted)}`);
            return;
          }
          // tried again with the next version that still asks for it
          if (appliedConfigRef.current === identity) {
            appliedConfigRef.current = undefined;
          }
          console.warn(
            `${LOG_PREFIX} ${configLabel(
              wanted
            )} was not applied; it may be unusable, or a newer state superseded it`
          );
        });
      }
    }
    const background = presenterState["backgroundLayer"];
    if (
      typeof background === "string" &&
      background !== appliedBackgroundRef.current
    ) {
      if (carma.mapping2D.setBackgroundLayer(background)) {
        appliedBackgroundRef.current = background;
        console.debug(`${LOG_PREFIX} applied background layer ${background}`);
      } else {
        console.warn(`${LOG_PREFIX} unknown background layer ${background}`);
      }
    }
  }, [presenterState, carma]);
};

/**
 * Sends the view to the page's own writer session whenever it changes, one
 * write at a time so an older one can never land last, and repeats it while
 * there is something to keep on the model. Leaving switches it off.
 */
const useSendView = (relay: MapRelayState | null, view: GeoportalView) => {
  const send = relay?.send;
  const sendOnExit = relay?.sendOnExit;
  const viewKey = JSON.stringify(view);
  const writeRef = useRef<((next: GeoportalView) => void) | null>(null);

  useEffect(() => {
    if (!send) {
      return;
    }
    let writing = false;
    let pending: GeoportalView | null = null;
    const write = (next: GeoportalView) => {
      if (writing) {
        pending = next;
        return;
      }
      writing = true;
      send(geoportalViewDocument(next))
        .catch((error: unknown) => {
          console.warn(`${LOG_PREFIX} telling the show the view failed`, error);
        })
        .finally(() => {
          writing = false;
          const queued = pending;
          pending = null;
          if (queued) {
            write(queued);
          }
        });
    };
    writeRef.current = write;
    return () => {
      writeRef.current = null;
      write(NO_VIEW);
    };
  }, [send]);

  useEffect(() => {
    const write = writeRef.current;
    if (!write) {
      return;
    }
    const current = JSON.parse(viewKey) as GeoportalView;
    write(current);
    if (!current.frame && !current.selection) {
      return;
    }
    const repeater = window.setInterval(
      () => write(current),
      REPEAT_INTERVAL_MS
    );
    return () => window.clearInterval(repeater);
  }, [send, viewKey]);

  useEffect(() => {
    if (!sendOnExit) {
      return;
    }
    const leave = () => sendOnExit(geoportalViewDocument(NO_VIEW));
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [sendOnExit]);
};

/**
 * The plain geoportal following a show (`?relay=<CODE>`, see `MapRelay`).
 * It shows the presenter's layers and base map, and flies to a scene's
 * position when the scene changes; between scenes the user moves freely. Once
 * the user moved the map, the other screens see its frame, and a button flies
 * back. A selection in the info box lights up on the model.
 *
 * Without a show it does nothing. A screen of its own (a legend, an info box)
 * is a route with its own `mapRelay` tags and a consumer addon of its own;
 * the hooks here are the parts it may share.
 */
export const RelayFollower = ({
  config,
  carma,
  libreMap,
  store,
}: AddonComponentProps<"relayFollower">) => {
  const [relay] = useAddonState("mapRelay");
  const presenterState = relay?.heard.presenter?.state;
  const flyDurationMs = config?.flyDurationMs ?? DEFAULT_FLY_DURATION_MS;
  const controlPosition = config?.controlPosition ?? "topleft";
  const controlOrder = config?.controlOrder ?? DEFAULT_CONTROL_ORDER;
  const { clearSelection } = useMapSelection();

  useShowLayers(presenterState, carma);

  const [movedAway, setMovedAway] = useState(false);
  const [frame, setFrame] = useState<Bounds3857 | null>(null);
  /** the scene's position or the model, where the button flies back to */
  const homeRef = useRef<Bounds3857 | null>(null);
  /** the map and scene of the last flight, so only a new scene flies */
  const flownRef = useRef<{ map: LibreMap; key: string } | null>(null);
  /**
   * Our own flight: its moves are not the user's. `starting` covers the
   * moveend the previous flight fires when this one stops it.
   */
  const flightRef = useRef<{ starting: boolean; timer: number | null }>({
    starting: false,
    timer: null,
  });

  const endFlight = useCallback(() => {
    const flight = flightRef.current;
    if (flight.timer !== null) {
      window.clearTimeout(flight.timer);
      flight.timer = null;
    }
  }, []);

  const flyTo = useCallback(
    (map: LibreMap, bounds: Bounds3857, durationMs: number) => {
      const flight = flightRef.current;
      endFlight();
      setMovedAway(false);
      flight.starting = true;
      try {
        map.fitBounds(lngLatBoundsOf(bounds), {
          padding: 0,
          bearing: 0,
          ...(durationMs > 0
            ? { duration: durationMs, essential: true }
            : { animate: false }),
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} flight failed`, error);
      } finally {
        flight.starting = false;
      }
      if (durationMs > 0) {
        flight.timer = window.setTimeout(() => {
          flight.timer = null;
        }, durationMs + FLIGHT_GRACE_MS);
      }
    },
    [endFlight]
  );

  const home = homeOf(presenterState, config?.modelBounds3857);
  const flightKey = home ? flightKeyOf(presenterState, home) : "";

  // a new scene: fly there, which also brings back a user who moved away
  useEffect(() => {
    if (!libreMap || !home) {
      return;
    }
    const previous = flownRef.current;
    if (previous?.map === libreMap && previous.key === flightKey) {
      return;
    }
    homeRef.current = home;
    flownRef.current = { map: libreMap, key: flightKey };
    // the page just opened on the show: no flight from wherever it started
    const isFirst = previous?.map !== libreMap;
    console.info(
      `${LOG_PREFIX} ${isFirst ? "jumping" : "flying"} to the scene`,
      home
    );
    flyTo(libreMap, home, isFirst ? 0 : flyDurationMs);
    // home is what flightKey says
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libreMap, flightKey, flyDurationMs, flyTo]);

  // every move that is not our own flight is the user's: drag, wheel, pinch,
  // the zoom buttons, a jump from the search
  const isFollowing = relay !== null && relay !== undefined;
  useEffect(() => {
    if (!libreMap || !isFollowing) {
      return;
    }
    let resizing = false;
    const handleMoveStart = (event: MapLibreEvent<unknown>) => {
      // the user took over a flight, so its end is theirs
      if (flightRef.current.timer !== null && event.originalEvent) {
        endFlight();
      }
    };
    const handleResize = () => {
      resizing = true;
    };
    const handleMoveEnd = () => {
      const flight = flightRef.current;
      if (flight.starting) {
        return;
      }
      if (resizing) {
        resizing = false;
        setFrame(frameOfMap(libreMap));
        return;
      }
      if (flight.timer !== null) {
        endFlight();
        return;
      }
      if (!homeRef.current) {
        return;
      }
      setMovedAway(true);
      setFrame(frameOfMap(libreMap));
    };
    libreMap.on("movestart", handleMoveStart);
    libreMap.on("resize", handleResize);
    libreMap.on("moveend", handleMoveEnd);
    return () => {
      libreMap.off("movestart", handleMoveStart);
      libreMap.off("resize", handleResize);
      libreMap.off("moveend", handleMoveEnd);
      endFlight();
    };
  }, [libreMap, isFollowing, endFlight]);

  const selectedFeature = useSyncExternalStore(store.subscribe, () =>
    selectedFeatureOf(store.getState())
  );
  const selection = useMemo(
    () => selectionOfFeature(selectedFeature),
    [selectedFeature]
  );

  useSendView(relay, followerView(movedAway, frame, selection));

  const goBack = useCallback(() => {
    const home = homeRef.current;
    CLEAR_INFO_BOX_ACTIONS.forEach((action) => store.dispatch(action));
    clearSelection();
    if (libreMap && home) {
      flyTo(libreMap, home, flyDurationMs);
    }
  }, [store, clearSelection, libreMap, flyTo, flyDurationMs]);

  if (!isFollowing || !movedAway || !libreMap) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip title={BACK_LABEL} placement="right">
        <ControlButtonStyler onClick={goBack} dataTestId="relay-follower-back">
          <FontAwesomeIcon icon={faArrowRotateLeft} />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
