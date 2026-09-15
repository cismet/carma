import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faRoute } from "@fortawesome/free-solid-svg-icons";

import { useLocate } from "@carma-mapping/contexts";
import { formatRouteSummary, getModeIcon } from "@carma-mapping/routing";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import {
  DEFAULT_AHEAD_COLOR,
  DEFAULT_ARRIVAL_METERS,
  DEFAULT_DURATION,
  DEFAULT_FOLLOW_DURATION,
  DEFAULT_LOOK_AHEAD_METERS,
  DEFAULT_PITCH,
  DEFAULT_RECENTER_LABEL,
  DEFAULT_RECENTER_ORDER,
  DEFAULT_RECENTER_POSITION,
  DEFAULT_SNAP_TOLERANCE_METERS,
  DEFAULT_TRAVELLED_COLOR,
  DEFAULT_ZOOM,
  REMAINING_PREFIX,
} from "./config";
import { RecenterControl } from "./RecenterControl";
import {
  clearRouteLine,
  drawRouteLine,
  routeLineIsDrawn,
  setRouteLineProgress,
} from "./routeLine";
import { routeCameraTarget, type RouteCameraTarget } from "./routeCamera";
import { useActiveRoute, type RouteProgress } from "./routeChannel";

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
 * The user's own hand wins: a drag, a wheel, a rotate pauses the following,
 * the camera stays where they put it and the fixes keep coming in unseen. A
 * button at the bottom of the map, "Zentrieren", puts the camera back on the
 * position and the following resumes, the way the recenter button of any
 * navigation app does; it is the one piece of UI the addon renders itself.
 * The navigation only ends with the route button, arrival, or the route
 * going away.
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
    aheadColor = DEFAULT_AHEAD_COLOR,
    travelledColor = DEFAULT_TRAVELLED_COLOR,
  } = config ?? {};

  const [route] = useActiveRoute();
  // a producer keeps the coordinates stable per route, so their identity is
  // what says "another route" without comparing every vertex
  const coordinates = route?.coordinates ?? null;

  // what the route costs as a whole: the note before the start, and what the
  // countdown scales while a navigation runs
  const durationInSeconds = route?.durationInSeconds;
  const distanceInMeters = route?.distanceInMeters;
  const routeMode = route?.mode;

  const { currentPosition, activate } = useLocate();
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
   * The whole route's numbers, for the countdown to scale. Through a ref
   * because `flyOntoRoute` below reads them and is what `start` is built from:
   * a route whose numbers arrived a render later must not republish the offer.
   */
  const summaryRef = useRef({ durationInSeconds, distanceInMeters });
  summaryRef.current = { durationInSeconds, distanceInMeters };

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
    const { durationInSeconds, distanceInMeters } = summaryRef.current;
    setProgress(routeProgress(target, durationInSeconds, distanceInMeters));
  }, []);

  /**
   * Counts the flights, so a `moveend` of a leave that was overtaken by a new
   * `start` does not end the navigation that start just began.
   */
  const flightRef = useRef(0);
  /** the bearing of the last fix on the route, kept while a fix is off it */
  const bearingRef = useRef(0);

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
      if (!map || !animate) {
        map?.jumpTo({ pitch: 0, bearing: 0 });
        setNavigating(false);
        return;
      }
      if (map.getPitch() === 0 && map.getBearing() === 0) {
        setNavigating(false);
        return;
      }
      map.once("moveend", () => {
        if (flightRef.current === flight) {
          setNavigating(false);
        }
      });
      map.easeTo({ pitch: 0, bearing: 0, duration });
    },
    [duration]
  );

  // the route this navigation was started on is not the one in focus any
  // more, or there is none: the navigation goes with it
  useEffect(() => {
    if (navigatingRef.current) {
      leave(false);
    }
  }, [coordinates, leave]);

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
  ]);

  const start = useCallback(() => {
    // the fixes are what the camera goes along with; without the map moving
    // to them on its own, which is our job from here on
    activate({ fly: false });
    // the restriction reads `navigating` and unlocks the camera on it; that
    // write lands before the ease starts moving, so the bearing sticks
    setNavigating(true);
    setFollowing(true);
    flyOntoRoute();
  }, [activate, flyOntoRoute]);

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
   */
  useEffect(() => {
    if (!libreMap || !navigating || !coordinates) {
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
  }, [libreMap, navigating, coordinates, colors]);

  /** the split follows the user, one paint property per fix that moved it */
  useEffect(() => {
    if (!libreMap || !navigating) {
      return;
    }
    setRouteLineProgress(libreMap, split, colors);
  }, [libreMap, navigating, split, colors]);

  /**
   * The button, for as long as there is a route to go along. Re-registered
   * under the same key when `navigating` flips, which swaps its label and
   * colour in place; the remover takes it out when the route goes, so a
   * feature without a route in focus shows no button.
   */
  useEffect(() => {
    if (!route) {
      return;
    }
    return carma.ui.addInfoBoxAction({
      key: "routing",
      tooltip: navigating ? "Navigation beenden" : "Route anzeigen",
      icon: faRoute,
      active: navigating,
      onClick: navigating ? stop : start,
    });
  }, [carma, route, navigating, start, stop]);

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
  const noteText = countdown ?? summary;

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
      icon: getModeIcon(routeMode ?? "car"),
    });
  }, [carma, noteText, routeMode]);

  const [, publishNavigation] = useAddonState("routeNavigation");
  useEffect(() => {
    publishNavigation({
      navigation: { navigating, following, progress, start, stop, recenter },
    });
  }, [
    publishNavigation,
    navigating,
    following,
    progress,
    start,
    stop,
    recenter,
  ]);
  // the offer goes with the addon, so a route without it shows no button
  useEffect(
    () => () => publishNavigation({ navigation: null }),
    [publishNavigation]
  );

  // the recenter button, only while the user has taken the camera off
  if (!libreMap || !navigating || following) {
    return null;
  }
  return (
    <RecenterControl
      position={recenterPosition}
      order={recenterOrder}
      label={recenterLabel}
      onClick={recenter}
    />
  );
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
 */
const routeProgress = (
  target: RouteCameraTarget,
  durationInSeconds?: number,
  distanceInMeters?: number
): RouteProgress => {
  const total = target.along + target.remaining;
  const ahead = total > 0 ? target.remaining / total : 0;
  return {
    remainingMeters:
      distanceInMeters !== undefined
        ? distanceInMeters * ahead
        : target.remaining,
    remainingSeconds:
      durationInSeconds !== undefined ? durationInSeconds * ahead : undefined,
    fraction: 1 - ahead,
  };
};
