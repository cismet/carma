import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LibreMap } from "maplibre-gl";

import { getHashParams } from "@carma-commons/utils";
import { getFromWebMercatorToWGS84 } from "@carma-geo/proj";

import type { MappingConfig } from "@carma-api";
import {
  boundsKey,
  isBounds3857,
  type Bounds3857,
} from "@carma-mapping/show-remote";

import type { AddonComponentProps } from "../../lib/registry";
import { subscribe, type RelaySubscription } from "./relay";

/**
 * Projection-mapping source window.
 *
 * carmaPM screen-captures this browser window and projects it onto a physical
 * 3D-printed model, looking up each visible model point's world position and
 * sampling the capture there. That only works while the map shows exactly the
 * model's EPSG:3857 rectangle, filling the window, north up, with no padding
 * (carmaPM docs/08-SOURCE-CONTRACT). Any pan or zoom breaks the physical
 * registration by definition, so the addon fits the rectangle and then snaps
 * the view back whenever anything else moves it.
 *
 * MapLibre's own `fitBounds` computes `min(scaleX, scaleY)` at fractional
 * zoom, which is the uniform fit we want; with `padding: 0` it is exact,
 * because nothing in the geoportal sets `transform.padding`.
 */

const LOG_PREFIX = "[OUTLET]";
const DIAGNOSTICS_KEY = "__CARMA_OUTLET";
const BOUNDS_PARAM = "bounds";
const RELAY_PARAM = "relay";
const LOG_LIMIT = 200;

/** aspect mismatch beyond this shows visibly on the model, see the plan's table */
const DEFAULT_ASPECT_TOLERANCE = 1e-3;

const DEFAULT_FLY_DURATION_MS = 2000;
/**
 * A flight rides the render loop, which stalls while the window is occluded.
 * If it has not landed this long after its planned end, jump instead.
 */
const FLIGHT_GRACE_MS = 1500;

/**
 * Sub-pixel drift is invisible in the capture and not worth a re-fit. Comparing
 * against the box our own last fit produced (rather than against the window
 * edges, which also differ by the aspect slack) is what keeps the lock from
 * feeding itself, whether or not maplibre emits the fit's `moveend`
 * synchronously.
 */
const DRIFT_EPSILON_PX = 0.5;

const hasDrifted = (box: BoundsBox, applied: BoundsBox | null): boolean =>
  !applied ||
  Math.abs(box.left - applied.left) > DRIFT_EPSILON_PX ||
  Math.abs(box.top - applied.top) > DRIFT_EPSILON_PX ||
  Math.abs(box.width - applied.width) > DRIFT_EPSILON_PX ||
  Math.abs(box.height - applied.height) > DRIFT_EPSILON_PX;

export type OutletConfig = {
  /** default EPSG:3857 rectangle [minX, minY, maxX, maxY]; overridden by ?bounds= */
  bounds3857?: readonly [number, number, number, number];
  /** snap the view back on every external change (default true) */
  lockView?: boolean;
  /** warn when |canvasAspect / boundsAspect - 1| exceeds this (default 1e-3) */
  aspectTolerance?: number;
  /** draw a box on the requested bounds, so they are visible on any window (default true) */
  showBounds?: boolean;
  /** map-relay base url; the session code comes from ?relay= */
  relayBaseUrl?: string;
  /** how long the flight to a position the remote sends takes (default 2000); 0 jumps */
  flyDurationMs?: number;
};

/**
 * What the remote may ask the source window to show, as a desired state rather
 * than as commands: the whole document is applied on every change, so a reload
 * or a reconnect lands in the right place with nothing to replay.
 */
export type OutletRemoteState = {
  /**
   * Where to fly, the same rectangle `?bounds=` takes. A `?bounds=` in the url
   * wins: there it is the georeference of a printed model, and a remote moving
   * it would break projector registration, so a projection setup pins it and
   * the remote cannot. Without one, the remote's position replaces the addon's
   * default rectangle.
   */
  bounds?: Bounds3857;
  /**
   * What to show: either the id of a shared configuration, the same value
   * `?usedConfig=` takes, or the configuration itself. The second form needs
   * nothing to be stored anywhere and costs the display no round trip, so a
   * remote composing what to project can just say it.
   */
  config?: string | MappingConfig;
  /** id of a background layer, as `carma.mapping2D.getBackgroundLayers()` reports it */
  backgroundLayer?: string;
};

/** what a config field was applied as, so re-delivering it changes nothing */
const configIdentity = (value: string | MappingConfig): string =>
  typeof value === "string" ? `id:${value}` : `doc:${JSON.stringify(value)}`;

const REMOTE_STATE_KEYS: readonly (keyof OutletRemoteState)[] = [
  "bounds",
  "config",
  "backgroundLayer",
];

/** where the requested rectangle sits on screen, in css pixels */
type BoundsBox = { left: number; top: number; width: number; height: number };

type BoundsWgs84 = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

type ResolvedBounds = {
  bounds3857: Bounds3857;
  wgs84: BoundsWgs84;
  source: "query" | "remote" | "config";
};

type VerifyReport = {
  ok: boolean;
  problems: string[];
  widthPx: number;
  heightPx: number;
  zoom: number;
  bearing: number;
  pitch: number;
  canvasAspect: number;
  requiredAspect: number;
  aspectRel: number;
  /** pixel offsets of the requested corners from the window corners */
  offsetsPx: { nwX: number; nwY: number; seX: number; seY: number };
  worstPx: number;
  worstMeters: number;
  /** the requested rectangle in screen pixels */
  box: BoundsBox;
};

/** `minX,minY,maxX,maxY` in EPSG:3857, or null when the value is unusable */
const parseBoundsParam = (raw: string | undefined): Bounds3857 | null => {
  if (!raw) {
    return null;
  }
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (!isBounds3857(parts)) {
    console.error(
      `${LOG_PREFIX} ignoring invalid ?${BOUNDS_PARAM}=, expected four EPSG:3857 numbers minX,minY,maxX,maxY`,
      { raw }
    );
    return null;
  }
  return parts;
};

const toWgs84 = (bounds: Bounds3857): BoundsWgs84 => {
  const [minX, minY, maxX, maxY] = bounds;
  const [minLng, minLat] = getFromWebMercatorToWGS84([minX, minY]);
  const [maxLng, maxLat] = getFromWebMercatorToWGS84([maxX, maxY]);
  return { minLng, minLat, maxLng, maxLat };
};

/**
 * The query param wins over the remote's position, which wins over the config
 * default; none of them valid means do nothing.
 */
const resolveBounds = (
  config: OutletConfig | undefined,
  remoteBounds: Bounds3857 | null
): ResolvedBounds | null => {
  const fromQuery = parseBoundsParam(getHashParams()[BOUNDS_PARAM]);
  if (fromQuery) {
    return {
      bounds3857: fromQuery,
      wgs84: toWgs84(fromQuery),
      source: "query",
    };
  }
  if (remoteBounds) {
    return {
      bounds3857: remoteBounds,
      wgs84: toWgs84(remoteBounds),
      source: "remote",
    };
  }
  const fromConfig = config?.bounds3857;
  if (fromConfig && isBounds3857(fromConfig)) {
    return {
      bounds3857: fromConfig,
      wgs84: toWgs84(fromConfig),
      source: "config",
    };
  }
  return null;
};

/**
 * Where the requested rectangle actually landed, in pixels. Projecting the
 * requested corners is exact and needs no reverse transformation: the NW
 * corner must land on (0, 0) and the SE corner on (width, height).
 */
const verify = (
  map: LibreMap,
  { bounds3857, wgs84 }: ResolvedBounds,
  aspectTolerance: number
): VerifyReport => {
  const canvas = map.getCanvas();
  const widthPx = canvas.clientWidth;
  const heightPx = canvas.clientHeight;

  const nw = map.project([wgs84.minLng, wgs84.maxLat]);
  const se = map.project([wgs84.maxLng, wgs84.minLat]);
  const offsetsPx = {
    nwX: nw.x,
    nwY: nw.y,
    seX: se.x - widthPx,
    seY: se.y - heightPx,
  };

  const [minX, minY, maxX, maxY] = bounds3857;
  const metersPerPixel = (maxX - minX) / widthPx;
  const worstPx = Math.max(
    ...Object.values(offsetsPx).map((offset) => Math.abs(offset))
  );

  const requiredAspect = (maxX - minX) / (maxY - minY);
  const canvasAspect = widthPx / heightPx;
  const aspectRel = canvasAspect / requiredAspect - 1;

  const bearing = map.getBearing();
  const pitch = map.getPitch();

  const problems: string[] = [];
  if (bearing !== 0 || pitch !== 0) {
    problems.push(
      `map is rotated or tilted (bearing ${bearing}, pitch ${pitch})`
    );
  }
  if (widthPx !== window.innerWidth || heightPx !== window.innerHeight) {
    problems.push(
      `canvas ${widthPx}x${heightPx} does not fill the window ${window.innerWidth}x${window.innerHeight}`
    );
  }
  if (Math.abs(aspectRel) > aspectTolerance) {
    problems.push(
      `window aspect ${canvasAspect.toFixed(
        6
      )} differs from the required ${requiredAspect.toFixed(
        6
      )}; size the source window to that aspect`
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    widthPx,
    heightPx,
    zoom: map.getZoom(),
    bearing,
    pitch,
    canvasAspect,
    requiredAspect,
    aspectRel,
    offsetsPx,
    worstPx,
    worstMeters: worstPx * metersPerPixel,
    box: {
      left: nw.x,
      top: nw.y,
      width: se.x - nw.x,
      height: se.y - nw.y,
    },
  };
};

export const OutletAddon = ({
  config,
  carma,
  leafletMap,
  libreMap,
}: AddonComponentProps<"outlet">) => {
  const applyingRef = useRef(false);
  const appliedBoxRef = useRef<BoundsBox | null>(null);
  /** the map and rectangle of the last fit, so only a changed rectangle on the same map flies */
  const fittedRef = useRef<{ map: LibreMap; key: string } | null>(null);
  const [remoteBounds, setRemoteBounds] = useState<Bounds3857 | null>(null);
  const resolved = useMemo(
    () => resolveBounds(config, remoteBounds),
    [config, remoteBounds]
  );
  const lockView = config?.lockView ?? true;
  const aspectTolerance = config?.aspectTolerance ?? DEFAULT_ASPECT_TOLERANCE;
  const showBounds = config?.showBounds ?? true;
  const flyDurationMs = config?.flyDurationMs ?? DEFAULT_FLY_DURATION_MS;
  const resolvedKey = resolved ? boundsKey(resolved.bounds3857) : "";
  const [box, setBox] = useState<BoundsBox | null>(null);
  /** a `?bounds=` in the url pins the position against the remote */
  const isPositionPinnedRef = useRef(false);
  isPositionPinnedRef.current = resolved?.source === "query";
  const ignoredBoundsKeyRef = useRef<string | null>(null);

  /** what the remote last asked for and got, so an unchanged field is not re-applied */
  const appliedRemoteRef = useRef<OutletRemoteState>({});
  /** the config field's identity, since a whole configuration cannot be compared by value */
  const appliedConfigIdentityRef = useRef<string | undefined>(undefined);
  const relayRef = useRef<RelaySubscription | null>(null);
  const relayCode = getHashParams()[RELAY_PARAM];
  const relayBaseUrl = config?.relayBaseUrl;

  useEffect(() => {
    if (!resolved) {
      console.error(
        `${LOG_PREFIX} no usable bounds; pass ?${BOUNDS_PARAM}=minX,minY,maxX,maxY (EPSG:3857) or set bounds3857 in the addon config. The map was left untouched.`
      );
      return;
    }

    if (!libreMap) {
      // leafletMap set means we are on the leaflet engine and no libre map is
      // ever coming; otherwise the libre map simply has not been created yet.
      if (leafletMap) {
        console.error(
          `${LOG_PREFIX} needs the MapLibre engine, add ?ff=ng to the url. The map was left untouched.`
        );
      }
      return;
    }

    const log: unknown[] = [];
    const diagnostics = {
      /** the live map, so the source window can be inspected and provoked from
       * the console on deployments where `window.carma` is not exposed */
      map: libreMap,
      requested3857: resolved.bounds3857,
      requestedWgs84: resolved.wgs84,
      source: resolved.source,
      requiredAspect:
        (resolved.bounds3857[2] - resolved.bounds3857[0]) /
        (resolved.bounds3857[3] - resolved.bounds3857[1]),
      last: undefined as unknown,
      log,
      verify: () => verify(libreMap, resolved, aspectTolerance),
      refit: () => {
        applyFit("manual");
      },
      /** null when this window is not remote-controlled, see ?relay= */
      relay: () => relayRef.current?.status() ?? null,
      remoteState: () => ({ ...appliedRemoteRef.current }),
    };

    const record = (reason: string, report: VerifyReport) => {
      const entry = { reason, ...report };
      diagnostics.last = entry;
      appliedBoxRef.current = report.box;
      setBox(report.box);
      log.push(entry);
      if (log.length > LOG_LIMIT) {
        log.shift();
      }
      if (report.ok) {
        console.debug(`${LOG_PREFIX} fitted (${reason})`, entry);
      } else {
        console.warn(`${LOG_PREFIX} fitted with problems (${reason})`, entry);
      }
    };

    const { minLng, minLat, maxLng, maxLat } = resolved.wgs84;
    const target: [[number, number], [number, number]] = [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
    const fitOptions = { padding: 0, bearing: 0, pitch: 0 };

    /** the flight in progress; the guard stays up until it lands */
    let flight: { land: () => void; timer: number } | null = null;

    const endFlight = () => {
      if (flight) {
        libreMap.off("moveend", flight.land);
        window.clearTimeout(flight.timer);
        flight = null;
      }
    };

    // Jumps are synchronous because animate is false, so the guard reliably
    // keeps the moveend they emit from re-entering here. A flight keeps the
    // guard up until its own moveend.
    const applyFit = (reason: string, durationMs = 0) => {
      if (applyingRef.current) {
        return;
      }
      applyingRef.current = true;
      if (durationMs > 0) {
        try {
          libreMap.fitBounds(target, {
            ...fitOptions,
            duration: durationMs,
            // a reduced-motion setting on the display machine must not turn it into a jump
            essential: true,
          });
        } catch (error) {
          console.error(`${LOG_PREFIX} flight failed (${reason})`, error);
          applyingRef.current = false;
          return;
        }
        // Registered after starting: a new flight stops a running animation,
        // and the moveend that one fires is not this flight landing.
        const land = () => {
          endFlight();
          applyingRef.current = false;
          record(reason, verify(libreMap, resolved, aspectTolerance));
        };
        const timer = window.setTimeout(() => {
          endFlight();
          // still guarded, so the moveend stop() fires is ignored
          libreMap.stop();
          applyingRef.current = false;
          applyFit(`${reason}, flight did not land`);
        }, durationMs + FLIGHT_GRACE_MS);
        flight = { land, timer };
        libreMap.on("moveend", land);
        return;
      }
      try {
        libreMap.fitBounds(target, { ...fitOptions, animate: false });
        record(reason, verify(libreMap, resolved, aspectTolerance));
      } catch (error) {
        console.error(`${LOG_PREFIX} fit failed (${reason})`, error);
      } finally {
        applyingRef.current = false;
      }
    };

    (window as unknown as Record<string, unknown>)[DIAGNOSTICS_KEY] =
      diagnostics;

    // A leftover 3d key in the hash would leave the map in cesium mode, which
    // renders this route as a black window because ui.hideAll forbids 3d.
    carma.mapping2D.activate();

    // Explicit, not observer-driven: observer deliveries ride the rendering
    // pipeline and never arrive while the window is occluded or backgrounded,
    // which is exactly what the source window is during app boot. So the
    // first fit jumps; only a changed rectangle on a map already fitted flies.
    const previous = fittedRef.current;
    const isMove =
      previous !== null &&
      previous.map === libreMap &&
      previous.key !== resolvedKey;
    fittedRef.current = { map: libreMap, key: resolvedKey };
    if (isMove) {
      applyFit(`moved to the ${resolved.source} position`, flyDurationMs);
    } else {
      applyFit("initial");
    }

    // The app applies its own views after load (hash routing, selections,
    // persisted state) and whoever writes last wins, so treat every externally
    // caused view change as illegal and snap straight back. Views that are
    // already correct are left alone, which is what keeps this from looping.
    const handleViewChange = () => {
      if (applyingRef.current) {
        return;
      }
      const report = verify(libreMap, resolved, aspectTolerance);
      if (lockView && hasDrifted(report.box, appliedBoxRef.current)) {
        applyFit("external view change");
        return;
      }
      setBox(report.box);
    };
    libreMap.on("moveend", handleViewChange);
    libreMap.on("resize", handleViewChange);

    return () => {
      // a flight still under way is taken over by the next fit, which stops it
      if (flight) {
        endFlight();
        applyingRef.current = false;
      }
      libreMap.off("moveend", handleViewChange);
      libreMap.off("resize", handleViewChange);
      delete (window as unknown as Record<string, unknown>)[DIAGNOSTICS_KEY];
    };
    // resolved is memoized on config and the remote position; resolvedKey
    // keeps the identity check honest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    libreMap,
    leafletMap,
    resolvedKey,
    lockView,
    aspectTolerance,
    flyDurationMs,
    carma,
  ]);

  /**
   * Remote control. Nobody is sitting at the machine that renders the source
   * window, so what it shows is steered from elsewhere through the relay
   * (`services/map-relay`). Deliberately independent of the map: applying a
   * configuration does not need one, so a relay-driven window keeps working
   * even while the map is still coming up.
   */
  useEffect(() => {
    if (!relayCode) {
      return;
    }
    if (!relayBaseUrl) {
      console.error(
        `${LOG_PREFIX} ?${RELAY_PARAM}=${relayCode} was given but no relayBaseUrl is configured for this route; remote control is off.`
      );
      return;
    }

    const applyRemoteState = async (raw: unknown) => {
      if (typeof raw !== "object" || raw === null) {
        console.warn(`${LOG_PREFIX} ignoring a non-object remote state`, raw);
        return;
      }
      const next = raw as OutletRemoteState;

      const unsupported = Object.keys(next).filter(
        (key) => !REMOTE_STATE_KEYS.includes(key as keyof OutletRemoteState)
      );
      if (unsupported.length > 0) {
        console.warn(
          `${LOG_PREFIX} ignoring unsupported remote state keys`,
          unsupported
        );
      }

      // Each field is compared against what was last applied successfully, so
      // re-delivering the same document (a reconnect, a late join) does nothing.
      if (next.bounds !== undefined) {
        if (!isBounds3857(next.bounds)) {
          console.warn(
            `${LOG_PREFIX} ignoring remote bounds that are not four EPSG:3857 numbers minX,minY,maxX,maxY`,
            next.bounds
          );
        } else if (isPositionPinnedRef.current) {
          const key = boundsKey(next.bounds);
          if (key !== ignoredBoundsKeyRef.current) {
            ignoredBoundsKeyRef.current = key;
            console.info(
              `${LOG_PREFIX} ?${BOUNDS_PARAM}= in the url pins the position; ignoring the remote's`,
              next.bounds
            );
          }
        } else {
          const applied = appliedRemoteRef.current.bounds;
          if (!applied || boundsKey(applied) !== boundsKey(next.bounds)) {
            appliedRemoteRef.current = {
              ...appliedRemoteRef.current,
              bounds: next.bounds,
            };
            setRemoteBounds(next.bounds);
            console.debug(`${LOG_PREFIX} remote position`, next.bounds);
          }
        }
      }

      const wantsConfig =
        typeof next.config === "string" ||
        (typeof next.config === "object" && next.config !== null);
      if (wantsConfig) {
        const wanted = next.config as string | MappingConfig;
        const identity = configIdentity(wanted);
        if (identity !== appliedConfigIdentityRef.current) {
          const applied =
            typeof wanted === "string"
              ? await carma.config.applyById(wanted)
              : await carma.config.setMappingConfig(wanted);
          const label =
            typeof wanted === "string"
              ? wanted
              : `a configuration with ${wanted.layers?.length ?? 0} layer(s)`;
          if (applied) {
            appliedConfigIdentityRef.current = identity;
            appliedRemoteRef.current = {
              ...appliedRemoteRef.current,
              config: wanted,
            };
            console.debug(`${LOG_PREFIX} applied ${label}`);
          } else {
            // Also the normal outcome when a newer document overtook this one.
            console.warn(
              `${LOG_PREFIX} ${label} was not applied; it may be unusable, or a newer state superseded it`
            );
          }
        }
      } else if (next.config !== undefined) {
        console.warn(
          `${LOG_PREFIX} ignoring a config that is neither an id nor a configuration`,
          next.config
        );
      }

      if (
        typeof next.backgroundLayer === "string" &&
        next.backgroundLayer !== appliedRemoteRef.current.backgroundLayer
      ) {
        const applied = carma.mapping2D.setBackgroundLayer(
          next.backgroundLayer
        );
        if (applied) {
          appliedRemoteRef.current = {
            ...appliedRemoteRef.current,
            backgroundLayer: next.backgroundLayer,
          };
          console.debug(
            `${LOG_PREFIX} applied background layer ${next.backgroundLayer}`
          );
        } else {
          console.warn(
            `${LOG_PREFIX} unknown background layer ${next.backgroundLayer}`
          );
        }
      }
    };

    const subscription = subscribe({
      base: relayBaseUrl,
      code: relayCode,
      onState: (state, meta) => {
        console.debug(`${LOG_PREFIX} remote state v${meta.v}`, state, meta);
        void applyRemoteState(state);
      },
    });
    relayRef.current = subscription;
    console.info(
      `${LOG_PREFIX} remote controlled via ${relayBaseUrl}, session ${relayCode}`
    );

    return () => {
      subscription.stop();
      relayRef.current = null;
    };
  }, [relayCode, relayBaseUrl, carma]);

  if (!showBounds || !box) {
    return null;
  }

  // A box on the requested bounds. When the window has the projection aspect
  // it sits exactly on the window edges; on any other window it shows where
  // the projected area actually is.
  return (
    <div
      style={{
        position: "fixed",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        border: "1px solid #ff00ff",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
};
