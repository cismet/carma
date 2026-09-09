import { useCallback, useEffect, useRef, useState } from "react";
import { faRoute } from "@fortawesome/free-solid-svg-icons";

import { useLocate } from "@carma-mapping/contexts";
import { formatRouteSummary, getModeIcon } from "@carma-mapping/routing";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import {
  DEFAULT_ARRIVAL_METERS,
  DEFAULT_DURATION,
  DEFAULT_FOLLOW_DURATION,
  DEFAULT_LOOK_AHEAD_METERS,
  DEFAULT_PITCH,
  DEFAULT_RECENTER_LABEL,
  DEFAULT_RECENTER_ORDER,
  DEFAULT_RECENTER_POSITION,
  DEFAULT_SNAP_TOLERANCE_METERS,
  DEFAULT_ZOOM,
} from "./config";
import { RecenterControl } from "./RecenterControl";
import { routeCameraTarget } from "./routeCamera";
import { useActiveRoute } from "./routeChannel";

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
 * pill at the bottom of the map, "Zentrieren", puts the camera back on the
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
  } = config ?? {};

  const [route] = useActiveRoute();
  // a producer keeps the coordinates stable per route, so their identity is
  // what says "another route" without comparing every vertex
  const coordinates = route?.coordinates ?? null;

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

  const [navigating, setNavigating] = useState(false);
  const navigatingRef = useRef(navigating);
  navigatingRef.current = navigating;
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(following);
  followingRef.current = following;

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
   * during the ease starts a move of its own and cuts it short.
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
  }, [zoom, pitch, lookAheadMeters, duration, snapToleranceMeters]);

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
   * The step per fix. Only while following: a paused navigation reads the
   * fixes and leaves the camera alone. The ease takes about one fix interval,
   * so the camera is still moving when the next fix arrives and the motion
   * reads as one. Arrival is judged on the route, not on a fix that happens to
   * be far from it.
   */
  useEffect(() => {
    const map = mapRef.current;
    const current = coordinatesRef.current;
    if (
      !map ||
      !current ||
      !position ||
      !currentPosition ||
      currentPosition === handledFixRef.current ||
      !navigating ||
      !following
    ) {
      return;
    }
    handledFixRef.current = currentPosition;
    const target = routeCameraTarget(current, lookAheadMeters, position);
    if (!target) {
      return;
    }
    const onRoute = target.offRoute <= snapToleranceMeters;
    if (onRoute && target.remaining <= arrivalMeters) {
      leave(true);
      return;
    }
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
   * The summary, for as long as the route in focus has one. Its own effect,
   * keyed on the numbers rather than on the route object: the button above is
   * re-registered when `navigating` flips, and the note has no reason to go
   * with it.
   */
  const durationInSeconds = route?.durationInSeconds;
  const distanceInMeters = route?.distanceInMeters;
  const routeMode = route?.mode;
  useEffect(() => {
    if (durationInSeconds === undefined || distanceInMeters === undefined) {
      return;
    }
    return carma.ui.addInfoBoxNote({
      key: "routing",
      text: formatRouteSummary(durationInSeconds, distanceInMeters),
      icon: getModeIcon(routeMode ?? "car"),
    });
  }, [carma, durationInSeconds, distanceInMeters, routeMode]);

  const [, publishNavigation] = useAddonState("routeNavigation");
  useEffect(() => {
    publishNavigation({
      navigation: { navigating, following, start, stop, recenter },
    });
  }, [publishNavigation, navigating, following, start, stop, recenter]);
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
