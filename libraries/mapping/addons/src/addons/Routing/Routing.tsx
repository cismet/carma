import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { faRoute } from "@fortawesome/free-solid-svg-icons";

import { useLocate } from "@carma-mapping/contexts";
import {
  fetchRoute,
  formatRouteSummary,
  getModeIcon,
  type RouteStep,
} from "@carma-mapping/routing";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import {
  DEFAULT_AHEAD_COLOR,
  DEFAULT_ARRIVAL_METERS,
  DEFAULT_DURATION,
  DEFAULT_FOLLOW_DURATION,
  DEFAULT_INSTRUCTION_ORDER,
  DEFAULT_INSTRUCTION_POSITION,
  DEFAULT_LOOK_AHEAD_METERS,
  DEFAULT_MAP_ONLY,
  DEFAULT_PITCH,
  DEFAULT_RECENTER_LABEL,
  DEFAULT_RECENTER_ORDER,
  DEFAULT_RECENTER_POSITION,
  DEFAULT_REROUTE,
  DEFAULT_SNAP_TOLERANCE_METERS,
  DEFAULT_THEN_ANNOUNCE_METERS,
  DEFAULT_THEN_WITHIN_METERS,
  DEFAULT_TRAVELLED_COLOR,
  DEFAULT_ZOOM,
  MIN_REROUTING_MS,
  REMAINING_PREFIX,
  REROUTING_LABEL,
  type RerouteSettings,
  type RoutingConfig,
} from "./config";
import { InstructionCard } from "./InstructionCard";
import { RecenterControl } from "./RecenterControl";
import { ROUTING_LAYER_ID } from "./routing-layer-row";
import { DEFAULT_ROUTE_MODE } from "./routeModeChannel";
import {
  clearRouteLine,
  drawRouteLine,
  routeLineIsDrawn,
  setRouteLineProgress,
} from "./routeLine";
import { routeCameraTarget, type RouteCameraTarget } from "./routeCamera";
import {
  useActiveRoute,
  type ActiveRoute,
  type RouteProgress,
} from "./routeChannel";
import { travelModeOf, type RouteMode } from "./routeMode";
import { stepAt } from "./routeSteps";

/**
 * Puts the user on the route and keeps them there: the map eases to where
 * they are on it, zooms in, tilts a little and turns so the road ahead runs
 * up the screen, and then goes along with every position fix until the
 * destination, turning at each corner.
 *
 * Asked, not automatic. The addon reads the `activeRoute` channel for the
 * route and, while there is one, puts a button into the selected feature's
 * info box through `carma.ui.addInfoBoxAction`, the same way the gazetteer
 * addons put their modes into the search: the app knows nothing about this
 * addon, it renders whatever actions were contributed. Picking a feature
 * therefore shows it as it always did, and the flight is one press away. Who
 * produced the route is not the addon's business: "In der Nähe" publishes the
 * route of the picked hit today, and anything that publishes a route later
 * gets the same button.
 *
 * What the route costs goes into the box the same way, as a note
 * (`carma.ui.addInfoBoxNote`): "12 Min · 4,3 km" with the mode's icon in
 * front, while the route in focus carries a duration. A route that was only
 * measured as the crow flies carries none and gets no note: a straight-line
 * distance is not a route summary.
 *
 * While a navigation runs that note counts down: "noch 6 Min · 2,1 km", what
 * is left from where the user is on the route, per fix. The meters come off
 * the route, the minutes are the route's own duration scaled by the fraction
 * still ahead (see `routeProgress`), and both are published on
 * `routeNavigation` for whoever else wants them. It counts down whether or not
 * the camera is following: the user goes on towards the destination while they
 * pan the map.
 *
 * Where the user is comes from the locate context, the one position every
 * reader of the map shares: the origin search hands that same position to
 * the ranking as its starting point, so the route begins where the fixes
 * begin, and the addon switches the location mode on without moving the map
 * when it starts. Each fix is snapped onto the route (GPS wanders a few
 * meters sideways) and the camera eases to it over about one fix interval,
 * so the motion is continuous rather than a hop per second. A fix too far
 * off the route is followed as it is, with the last bearing kept: the user
 * has left the route, and pulling them back onto it would lie. Close enough
 * to the end, the navigation ends on its own.
 *
 * Left for good, the route is asked for again (`reroute` in the config): a
 * few fixes in a row clearly off it, how many and how far depending on the
 * mode, and the routing service is asked for the way from the user's place to
 * the same destination by the same mode. The answer becomes the route being
 * driven, the navigation goes on along it. The route in focus on
 * `activeRoute` stays its producer's and is not touched: the navigation
 * carries its own copy, the driven route, published on `routeNavigation` for
 * the simulator to drive along. An answer that comes when the user is back on
 * the old route, or after the navigation ended, is dropped.
 *
 * The user's own hand wins: a drag, a wheel, a rotate pauses the following,
 * the camera stays where they put it and the fixes keep coming in unseen. A
 * button under the layer bar, "Zentrieren", puts the camera back on the
 * position and the following resumes, the way the recenter button of any
 * navigation app does; it is the one piece of UI the addon renders itself.
 * The navigation only ends with the route button, the ✕ of its row, arrival,
 * or the route going away.
 *
 * The next turn is a card at the bottom of the map (`InstructionCard`): the
 * arrow, the meters to it and the street it leads onto, read off the same
 * snapped place as the countdown (`progress.instruction`, see `routeSteps`).
 * Only while the route carries instructions; a measured line has none and
 * shows no card.
 *
 * While it runs the layer bar shows a row for it (`useRoutingLayerRow`, in
 * the host's tree like the flood's and the time series' rows): the countdown
 * as its readout, and a ribbon behind it (`RoutingPanel`) with the slider that
 * moves the pretend device of the location simulator along the route.
 *
 * On a phone the map is all the user wants to see while driving, so the addon
 * asks the host for a map-only view for the duration (`carma.ui.hideControls`,
 * `mapOnly` in the config): navbar, buttons, search, info box and every other
 * addon's controls go, the navigation's row stays alone at the top with the
 * countdown and the ✕ that ends it, and the recenter button stays with it.
 *
 * Whether a navigation runs is published on `routeNavigation`, for the
 * camera restriction, which lets the map turn while it does.
 *
 * Navigation belongs to the route it was started on. Another route in focus,
 * or none, ends it: the user presses the button again for the next feature.
 * Ending it puts the camera back to north-up and flat, eased when the user
 * pressed the button and instantly when the route went away underneath, and
 * only then hands the camera back to the restriction (`cameraRestriction`
 * with `unlessNavigating`), the same addon that allows the rotation in the
 * first place. Re-locking snaps rather than eases, which is why the camera is
 * flattened first and locked second.
 *
 * MapLibre only: without a MapLibre map `start` does nothing and nothing is
 * rendered.
 */
export const Routing = ({
  config,
  carma,
  libreMap,
}: AddonComponentProps<"routing">) => {
  const {
    zoom = DEFAULT_ZOOM,
    pitch = DEFAULT_PITCH,
    lookAheadMeters = DEFAULT_LOOK_AHEAD_METERS,
    duration = DEFAULT_DURATION,
    followDuration = DEFAULT_FOLLOW_DURATION,
    snapToleranceMeters = DEFAULT_SNAP_TOLERANCE_METERS,
    arrivalMeters = DEFAULT_ARRIVAL_METERS,
    recenterPosition = DEFAULT_RECENTER_POSITION,
    recenterOrder = DEFAULT_RECENTER_ORDER,
    recenterLabel = DEFAULT_RECENTER_LABEL,
    instructionPosition = DEFAULT_INSTRUCTION_POSITION,
    instructionOrder = DEFAULT_INSTRUCTION_ORDER,
    thenWithinMeters = DEFAULT_THEN_WITHIN_METERS,
    thenAnnounceMeters = DEFAULT_THEN_ANNOUNCE_METERS,
    aheadColor = DEFAULT_AHEAD_COLOR,
    travelledColor = DEFAULT_TRAVELLED_COLOR,
    mapOnly = DEFAULT_MAP_ONLY,
    reroute,
  } = config ?? {};
  // read when a fix comes in, not a reason to rebuild the step per fix
  const rerouteRef = useRef(reroute);
  rerouteRef.current = reroute;

  const [focused] = useActiveRoute();
  // a producer keeps the coordinates stable per route, so their identity is
  // what says "another route" without comparing every vertex
  const focusedCoordinates = focused?.coordinates ?? null;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  /**
   * The route being driven: the focused one from `start` on, replaced by each
   * reroute, null again when the navigation ends. Everything that goes along
   * the route reads this one; before a start it is the focused route that the
   * note summarises.
   */
  const [drivenRoute, setDrivenRoute] = useState<ActiveRoute | null>(null);
  const drivenRef = useRef(drivenRoute);
  drivenRef.current = drivenRoute;
  const route = drivenRoute ?? focused;
  const coordinates = route?.coordinates ?? null;

  // what the route costs as a whole: the note before the start, and what the
  // countdown scales while a navigation runs
  const durationInSeconds = route?.durationInSeconds;
  const distanceInMeters = route?.distanceInMeters;
  const routeMode = route?.mode;
  // the instructions along it, for where the user is in them; a route that
  // was only measured has none
  const steps = route?.steps;

  const { currentPosition, activate, setTravelHeading } = useLocate();
  const position: [number, number] | null = currentPosition
    ? [currentPosition.coords.longitude, currentPosition.coords.latitude]
    : null;

  // `start` is published once and called from the info box; what it needs is
  // read through refs so a new route, map or fix does not republish the offer
  const mapRef = useRef(libreMap);
  mapRef.current = libreMap;
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;
  const positionRef = useRef(position);
  positionRef.current = position;
  const fixRef = useRef(currentPosition);
  fixRef.current = currentPosition;
  /**
   * The fix the camera was last sent to. The step effect below reacts to a
   * fix it has not seen, and to nothing else: `start` and `recenter` fly to
   * the current fix with the long ease and mark it seen, so the step does not
   * cut that flight short with its own one-second move.
   */
  const handledFixRef = useRef<GeolocationPosition | null>(null);

  /**
   * The whole route's numbers and instructions, for the countdown to scale
   * and the instruction to be looked up in. Through a ref because
   * `flyOntoRoute` below reads them and is what `start` is built from: a route
   * whose numbers arrived a render later must not republish the offer.
   */
  const summaryRef = useRef({ durationInSeconds, distanceInMeters, steps });
  summaryRef.current = { durationInSeconds, distanceInMeters, steps };

  const [navigating, setNavigating] = useState(false);
  const navigatingRef = useRef(navigating);
  navigatingRef.current = navigating;
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(following);
  followingRef.current = following;
  /** what is left to the destination; null while no navigation runs */
  const [progress, setProgress] = useState<RouteProgress | null>(null);

  /**
   * Reads what is left off a target the user is on. Not called for a target
   * further off the route than the tolerance: the place on the line is a guess
   * then, and so is everything read from it, so the last honest value stands.
   */
  const trackProgress = useCallback((target: RouteCameraTarget) => {
    const { durationInSeconds, distanceInMeters, steps } = summaryRef.current;
    setProgress(
      routeProgress(target, durationInSeconds, distanceInMeters, steps)
    );
  }, []);

  /**
   * Counts the flights, so a `moveend` of a leave that was overtaken by a new
   * `start` does not end the navigation that start just began.
   */
  const flightRef = useRef(0);
  /** the bearing of the last fix on the route, kept while a fix is off it */
  const bearingRef = useRef(0);

  /**
   * Counts the navigations, so the answer to a reroute asked during one is
   * dropped when it comes back during the next, or after the last.
   */
  const navigationIdRef = useRef(0);
  /** clearly-off fixes in a row; one on the route starts it over */
  const offFixesRef = useRef(0);
  /** the fix counted last, so an effect re-run for another reason does not count it twice */
  const countedFixRef = useRef<GeolocationPosition | null>(null);
  /** one request at a time, and not again before the mode's cooldown */
  const requestRef = useRef({ inFlight: false, startedAt: -Infinity });
  const [rerouting, setRerouting] = useState(false);

  /**
   * Makes `next` the route being driven. The refs follow at once, not on the
   * next render: `start` flies onto the route in the same call, and a reroute
   * reads its place on the new line right away.
   */
  const drive = useCallback((next: ActiveRoute | null) => {
    drivenRef.current = next;
    if (next) {
      coordinatesRef.current = next.coordinates;
      summaryRef.current = {
        durationInSeconds: next.durationInSeconds,
        distanceInMeters: next.distanceInMeters,
        steps: next.steps,
      };
    }
    setDrivenRoute(next);
  }, []);

  /** forgets everything about rerouting, for a navigation that starts or ends */
  const resetReroute = useCallback(() => {
    navigationIdRef.current++;
    offFixesRef.current = 0;
    requestRef.current = { inFlight: false, startedAt: -Infinity };
    setRerouting(false);
  }, []);

  /**
   * Takes the camera off the route: back to north-up and flat, which is the
   * view the restriction locks to, and then ends the navigation. The order
   * matters: `navigating` stays true until the camera is flat, because the
   * restriction re-locks the moment it flips and would snap the camera there
   * instead of letting it ease. Following stops at once, so no fix arriving
   * during the ease starts a move of its own and cuts it short, and so does
   * the countdown: the note is the whole route's summary again from the moment
   * the user asks to leave, not once the camera has finished flattening.
   *
   * Eased when the user asks for it, instant when the route goes away
   * underneath (a new starting point, another pick): whoever took the route
   * is about to move the map, and a flight of ours would be cut by theirs.
   */
  const leave = useCallback(
    (animate: boolean) => {
      const map = mapRef.current;
      const flight = ++flightRef.current;
      setFollowing(false);
      setProgress(null);
      resetReroute();
      // the user is a dot again, not an arrow going somewhere
      setTravelHeading(null);
      // the driven line goes with the navigation, not before: it stays drawn
      // while the camera flattens, rather than swapping back to the focused one
      const finish = () => {
        setNavigating(false);
        drive(null);
      };
      if (!map || !animate) {
        map?.jumpTo({ pitch: 0, bearing: 0 });
        finish();
        return;
      }
      if (map.getPitch() === 0 && map.getBearing() === 0) {
        finish();
        return;
      }
      map.once("moveend", () => {
        if (flightRef.current === flight) {
          finish();
        }
      });
      map.easeTo({ pitch: 0, bearing: 0, duration });
    },
    [duration, setTravelHeading, resetReroute, drive]
  );

  // an addon taken off the map mid-navigation must not leave the arrow behind
  useEffect(() => () => setTravelHeading(null), [setTravelHeading]);

  // the route this navigation was started on is not the one in focus any
  // more, or there is none: the navigation goes with it. The focused route,
  // not the driven one: a reroute is the same navigation going on
  useEffect(() => {
    if (navigatingRef.current) {
      leave(false);
    }
  }, [focusedCoordinates, leave]);

  /**
   * Eases the camera onto the user's place on the route, or onto its start
   * while no fix has come in yet, with the long ease: this is the flight of
   * `start` and of `recenter`, not the step of a fix.
   */
  const flyOntoRoute = useCallback(() => {
    const map = mapRef.current;
    const current = coordinatesRef.current;
    if (!map || !current) {
      return false;
    }
    const target = routeCameraTarget(
      current,
      lookAheadMeters,
      positionRef.current ?? undefined
    );
    if (!target) {
      return false;
    }
    const onRoute = target.offRoute <= snapToleranceMeters;
    if (onRoute) {
      bearingRef.current = target.bearing;
      // so the note counts down from the press rather than from the first fix
      // after it, which is up to a second later
      trackProgress(target);
      setTravelHeading(target.bearing);
    }
    handledFixRef.current = fixRef.current;
    flightRef.current++;
    map.easeTo({
      center: onRoute ? target.center : positionRef.current ?? target.center,
      zoom,
      bearing: onRoute ? target.bearing : bearingRef.current,
      pitch,
      duration,
    });
    return true;
  }, [
    zoom,
    pitch,
    lookAheadMeters,
    duration,
    snapToleranceMeters,
    trackProgress,
    setTravelHeading,
  ]);

  const start = useCallback(() => {
    // the fixes are what the camera goes along with; without the map moving
    // to them on its own, which is our job from here on
    activate({ fly: false });
    resetReroute();
    drive(focusedRef.current);
    // the restriction reads `navigating` and unlocks the camera on it; that
    // write lands before the ease starts moving, so the bearing sticks
    setNavigating(true);
    setFollowing(true);
    flyOntoRoute();
  }, [activate, flyOntoRoute, resetReroute, drive]);

  const stop = useCallback(() => {
    leave(true);
  }, [leave]);

  const recenter = useCallback(() => {
    if (!navigatingRef.current) {
      return;
    }
    setFollowing(true);
    flyOntoRoute();
  }, [flyOntoRoute]);

  /**
   * Asks for the way from `from` to the driven route's destination, by its
   * mode, and drives the answer. Once at a time and not within the mode's
   * cooldown of the last ask, so a user standing in a field off every road is
   * not asked for a route per fix.
   *
   * The answer is dropped when the navigation it was asked for is over, and
   * when the latest fix is back on the old route: the user took the turn after
   * all. Without an answer the old route stays; the next ask waits for the
   * cooldown. Taken, the new route's place is read at once, so the line's
   * split, the countdown and the card do not show the old route's numbers on
   * the new line until the next fix.
   */
  const requestReroute = useCallback(
    (from: [number, number]) => {
      const driven = drivenRef.current;
      const settings = rerouteSettingsOf(rerouteRef.current, driven?.mode);
      const destination = driven?.coordinates[driven.coordinates.length - 1];
      const request = requestRef.current;
      const now = Date.now();
      if (
        !driven?.mode ||
        !settings ||
        !destination ||
        request.inFlight ||
        now - request.startedAt < settings.cooldownMs
      ) {
        return;
      }
      request.inFlight = true;
      request.startedAt = now;
      const navigation = navigationIdRef.current;
      setRerouting(true);
      void Promise.all([
        fetchRoute({
          from: { lng: from[0], lat: from[1] },
          to: { lng: destination[0], lat: destination[1] },
          mode: travelModeOf(driven.mode),
        }),
        new Promise((resolve) => setTimeout(resolve, MIN_REROUTING_MS)),
      ]).then(([summary]) => {
        if (navigationIdRef.current !== navigation) {
          return;
        }
        request.inFlight = false;
        setRerouting(false);
        const old = drivenRef.current;
        const position = positionRef.current;
        if (!old || !summary || summary.coordinates.length < 2) {
          console.warn("[ROUTING] reroute found no route", {
            mode: driven.mode,
            from,
          });
          return;
        }
        if (position) {
          const back = routeCameraTarget(
            old.coordinates,
            lookAheadMeters,
            position
          );
          if (back && back.offRoute <= snapToleranceMeters) {
            return;
          }
        }
        const next: ActiveRoute = {
          ...old,
          source: "routing",
          coordinates: summary.coordinates,
          steps: summary.steps,
          durationInSeconds: summary.durationInSeconds,
          distanceInMeters: summary.distanceInMeters,
        };
        offFixesRef.current = 0;
        drive(next);
        const target = position
          ? routeCameraTarget(next.coordinates, lookAheadMeters, position)
          : null;
        if (target && target.offRoute <= snapToleranceMeters) {
          bearingRef.current = target.bearing;
          setTravelHeading(target.bearing);
          trackProgress(target);
        } else {
          // the service starts the line on the nearest road, which may be
          // further than the tolerance; nothing honest to show until a fix
          // is on it
          setProgress(null);
        }
      });
    },
    [
      lookAheadMeters,
      snapToleranceMeters,
      drive,
      setTravelHeading,
      trackProgress,
    ]
  );

  useEffect(() => {
    if (!libreMap || !navigating) {
      return;
    }
    const release = () => {
      if (libreMap.getTerrain()) {
        libreMap._elevationFreeze = false;
      }
    };
    libreMap.on("moveend", release);
    return () => {
      libreMap.off("moveend", release);
    };
  }, [libreMap, navigating]);

  /**
   * Keeps the camera's ground on the ground while it follows. With terrain,
   * MapLibre eases a copy of the camera whose elevation (the height of the
   * ground under the centre) is taken once, when the copy is made, and written
   * back over the real one on every frame. The eases per fix chain into each
   * other without a render in between, so that height never gets corrected:
   * the first flight keeps the height of wherever the map was before the
   * start, and at a navigation's zoom and pitch a lower one puts the camera
   * underground. Each frame of ours therefore gets the height of the ground
   * under its own centre, the value MapLibre itself sets when nothing moves.
   *
   * Only while following: the user's own moves are MapLibre's to handle.
   */
  useEffect(() => {
    if (!libreMap || !navigating) {
      return;
    }
    libreMap.transformCameraUpdate = (next) => {
      const terrain = libreMap.terrain;
      if (!terrain || !followingRef.current) {
        return {};
      }
      return {
        elevation: terrain.getElevationForLngLatZoom(
          next.center,
          libreMap.transform.tileZoom
        ),
      };
    };
    return () => {
      libreMap.transformCameraUpdate = null;
    };
  }, [libreMap, navigating]);

  /**
   * The step per fix: where the user is on the route, and what that means for
   * the camera and for what is left.
   *
   * Reading the fix and moving the camera are two different questions. The
   * place on the route is read on every fix of a navigation, because the user
   * goes on towards the destination whether or not the map is following them:
   * a paused navigation counts down and arrives like any other, only the
   * camera stays where the user put it. The camera step is the part that waits
   * for `following`, and it skips a fix that `start` or `recenter` already
   * flew to, so its one-second move does not cut their long flight short.
   *
   * The ease takes about one fix interval, so the camera is still moving when
   * the next fix arrives and the motion reads as one. Arrival is judged on the
   * route, not on a fix that happens to be far from it.
   */
  useEffect(() => {
    const map = mapRef.current;
    const current = coordinatesRef.current;
    if (!map || !current || !position || !currentPosition || !navigating) {
      return;
    }
    const target = routeCameraTarget(current, lookAheadMeters, position);
    if (!target) {
      return;
    }
    const onRoute = target.offRoute <= snapToleranceMeters;
    if (onRoute) {
      trackProgress(target);
      if (target.remaining <= arrivalMeters) {
        leave(true);
        return;
      }
      // the arrow turns with the road whether or not the camera follows
      setTravelHeading(target.bearing);
    }
    // left for good? Each fix counts once; a fix further off than it is
    // accurate, and further than the mode tolerates, counts as off
    if (currentPosition !== countedFixRef.current) {
      countedFixRef.current = currentPosition;
      const settings = rerouteSettingsOf(
        rerouteRef.current,
        drivenRef.current?.mode
      );
      if (settings) {
        const threshold = Math.max(
          settings.meters,
          snapToleranceMeters,
          currentPosition.coords.accuracy
        );
        if (onRoute) {
          offFixesRef.current = 0;
        } else if (target.offRoute > threshold) {
          offFixesRef.current++;
          if (offFixesRef.current >= settings.afterFixes) {
            requestReroute(position);
          }
        }
      }
    }
    if (!following || currentPosition === handledFixRef.current) {
      return;
    }
    handledFixRef.current = currentPosition;
    if (onRoute) {
      bearingRef.current = target.bearing;
    }
    map.easeTo({
      center: onRoute ? target.center : position,
      zoom,
      bearing: bearingRef.current,
      pitch,
      duration: followDuration,
      easing: (t) => t,
    });
    // `position` is a fresh tuple per render; the fix behind it is what counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPosition,
    navigating,
    following,
    zoom,
    pitch,
    lookAheadMeters,
    followDuration,
    snapToleranceMeters,
    arrivalMeters,
    leave,
    trackProgress,
    setTravelHeading,
    requestReroute,
  ]);

  /**
   * The user's hand pauses the following. Only their moves count: the eases
   * to each fix are ours and carry no `originalEvent`.
   */
  useEffect(() => {
    if (!libreMap || !navigating) {
      return;
    }
    const onMoveStart = (event: { originalEvent?: Event }) => {
      if (event.originalEvent) {
        setFollowing(false);
      }
    };
    libreMap.on("movestart", onMoveStart);
    return () => {
      libreMap.off("movestart", onMoveStart);
    };
  }, [libreMap, navigating]);

  const colors = useMemo(
    () => ({ aheadColor, travelledColor }),
    [aheadColor, travelledColor]
  );
  /**
   * Where the line changes colour, rounded to a thousandth of the route: a few
   * meters on a route of kilometers, below what anyone can see, and it keeps a
   * standing user from re-painting the line once a second.
   */
  const split = progress ? Math.round(progress.fraction * 1000) / 1000 : null;
  const splitRef = useRef(split);
  splitRef.current = split;

  /**
   * The line, for as long as a navigation runs. The producer of the route
   * takes its own lines off meanwhile (the ranking hides its candidates), so
   * what is on the map is the route being driven and nothing else.
   *
   * Redrawn on `styledata`: a basemap change rebuilds the style and drops
   * every source and layer with it, the same reason the ranking redraws its
   * routes there.
   *
   * Off the map while a reroute is on its way: the user has left that line,
   * and the card says a new one is coming. The new one is drawn when it
   * arrives; the old one comes back when the answer is dropped.
   */
  useEffect(() => {
    if (!libreMap || !navigating || !coordinates || rerouting) {
      return;
    }
    drawRouteLine(libreMap, coordinates, splitRef.current, colors);
    const onStyleData = () => {
      if (!routeLineIsDrawn(libreMap)) {
        drawRouteLine(libreMap, coordinates, splitRef.current, colors);
      }
    };
    libreMap.on("styledata", onStyleData);
    return () => {
      libreMap.off("styledata", onStyleData);
      clearRouteLine(libreMap);
    };
  }, [libreMap, navigating, coordinates, colors, rerouting]);

  /** the split follows the user, one paint property per fix that moved it */
  useEffect(() => {
    if (!libreMap || !navigating) {
      return;
    }
    setRouteLineProgress(libreMap, split, colors);
  }, [libreMap, navigating, split, colors]);

  /**
   * The button, for as long as there is a route to go along: one that starts
   * at the device's own position. A route from a searched address to a hit is
   * something to look at, not to drive; the camera would follow fixes that
   * are nowhere near it. Re-registered under the same key when `navigating`
   * flips, which swaps its label and colour in place; the remover takes it
   * out when the route goes, so a feature without a route in focus shows no
   * button.
   */
  const navigable = focused?.fromOwnPosition === true;
  useEffect(() => {
    if (!navigable) {
      return;
    }
    return carma.ui.addInfoBoxAction({
      key: "routing",
      tooltip: navigating ? "Navigation beenden" : "Route anzeigen",
      icon: faRoute,
      active: navigating,
      onClick: navigating ? stop : start,
    });
  }, [carma, navigable, navigating, start, stop]);

  /**
   * What the note says: the whole route while it is only in focus, what is
   * left of it while it is being driven. A route that carries no numbers is a
   * straight line someone measured rather than a route, and gets no note
   * either way.
   */
  const summary =
    durationInSeconds !== undefined && distanceInMeters !== undefined
      ? formatRouteSummary(durationInSeconds, distanceInMeters)
      : null;
  const countdown =
    summary && progress && progress.remainingSeconds !== undefined
      ? `${REMAINING_PREFIX} ${formatRouteSummary(
          progress.remainingSeconds,
          progress.remainingMeters
        )}`
      : null;
  // the old route's numbers are no answer while a new route is on its way
  const noteText = rerouting ? REROUTING_LABEL : countdown ?? summary;

  /**
   * The note, for as long as there is one to show. Its own effect, keyed on
   * the text rather than on the route or on the raw meters: the button above
   * is re-registered when `navigating` flips and the note has no reason to go
   * with it, and a fix a second only re-adds the note on the second the
   * rounded numbers actually change, so the info box is not re-rendered
   * between two roundings while the user stands at a light.
   */
  useEffect(() => {
    if (!noteText) {
      return;
    }
    return carma.ui.addInfoBoxNote({
      key: "routing",
      text: noteText,
      icon: getModeIcon(routeMode ?? DEFAULT_ROUTE_MODE),
    });
  }, [carma, noteText, routeMode]);

  /**
   * The map-only view, for as long as a navigation runs on a phone: the host
   * takes its chrome off the screen (`carma.ui.hideControls`) and keeps only
   * the navigation's own row, whose countdown is the readout and whose ✕ is
   * the way out. The remover on cleanup puts everything back, whether the
   * navigation ended or the addon was switched off underneath it.
   */
  useEffect(() => {
    if (!navigating || mapOnly === "never") {
      return;
    }
    if (mapOnly === "mobile" && !isMobile) {
      return;
    }
    return carma.ui.hideControls({
      key: "routing",
      keepLayerRows: [ROUTING_LAYER_ID],
    });
  }, [carma, navigating, mapOnly]);

  const [, publishNavigation] = useAddonState("routeNavigation");
  useEffect(() => {
    publishNavigation({
      navigation: {
        navigating,
        following,
        progress,
        route: drivenRoute,
        rerouting,
        start,
        stop,
        recenter,
      },
    });
  }, [
    publishNavigation,
    navigating,
    following,
    progress,
    drivenRoute,
    rerouting,
    start,
    stop,
    recenter,
  ]);
  // the offer goes with the addon, so a route without it shows no button
  useEffect(
    () => () => publishNavigation({ navigation: null }),
    [publishNavigation]
  );

  if (!libreMap || !navigating) {
    return null;
  }
  const instruction = progress?.instruction;
  return (
    <>
      {/* the next turn, for as long as the route has instructions to give,
          and the word that a new route is coming while it is */}
      {(instruction || rerouting) && (
        <InstructionCard
          instruction={instruction}
          rerouting={rerouting}
          position={instructionPosition}
          order={instructionOrder}
          thenWithinMeters={thenWithinMeters}
          thenAnnounceMeters={thenAnnounceMeters}
        />
      )}
      {/* the recenter button, only while the user has taken the camera off */}
      {!following && (
        <RecenterControl
          position={recenterPosition}
          order={recenterOrder}
          label={recenterLabel}
          onClick={recenter}
        />
      )}
    </>
  );
};

/**
 * When to reroute on a route of this mode: the mode's defaults, each value
 * overridden by the config's where it gives one. Null when rerouting is off,
 * and for a route without a mode, which was measured rather than routed and
 * has no mode to ask the service with.
 */
const rerouteSettingsOf = (
  reroute: RoutingConfig["reroute"],
  mode: RouteMode | undefined
): Required<RerouteSettings> | null => {
  if (reroute === false || !mode) {
    return null;
  }
  const defaults = DEFAULT_REROUTE[mode];
  const override = reroute?.[mode];
  return {
    meters: override?.meters ?? defaults.meters,
    afterFixes: override?.afterFixes ?? defaults.afterFixes,
    cooldownMs: override?.cooldownMs ?? defaults.cooldownMs,
  };
};

/**
 * What is left, from where the user is on the route.
 *
 * The meters are measured; the minutes are not. The routing service gives one
 * duration for the whole route and no per-segment speeds, so the time left is
 * that duration scaled by the fraction of the route still ahead: right at the
 * start and right at the destination, and off in between by however much the
 * route's speed varies. Asking the service again per fix is the only way to do
 * better, and a request a second is not worth those minutes.
 *
 * The distance is scaled the same way rather than taken from the geometry, so
 * both numbers agree about how far along the user is, and so the countdown
 * starts at the number the summary showed: the service's distance and the
 * geometry's length differ by a few meters, enough for a countdown to open at
 * "4,2 km" under a summary that said "4,3 km".
 *
 * The instruction is read off the same place, so it advances only while the
 * user is on the route and goes back when the place does (the simulator's
 * slider dragged back): it is a function of `along`, not of history.
 */
const routeProgress = (
  target: RouteCameraTarget,
  durationInSeconds?: number,
  distanceInMeters?: number,
  steps?: RouteStep[]
): RouteProgress => {
  const total = target.along + target.remaining;
  const ahead = total > 0 ? target.remaining / total : 0;
  const instruction = steps ? stepAt(steps, target.along) : undefined;
  return {
    remainingMeters:
      distanceInMeters !== undefined
        ? distanceInMeters * ahead
        : target.remaining,
    remainingSeconds:
      durationInSeconds !== undefined ? durationInSeconds * ahead : undefined,
    fraction: 1 - ahead,
    ...(instruction ? { instruction } : {}),
  };
};
