import { useCallback, useEffect, useRef, useState } from "react";
import { faRoute } from "@fortawesome/free-solid-svg-icons";

import { formatRouteSummary, getModeIcon } from "@carma-mapping/routing";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import {
  DEFAULT_DURATION,
  DEFAULT_LOOK_AHEAD_METERS,
  DEFAULT_PITCH,
  DEFAULT_ZOOM,
} from "./config";
import { routeCameraTarget } from "./routeCamera";
import { useActiveRoute } from "./routeChannel";

/**
 * Puts the user on the route in focus, when asked: the map eases to the start
 * of the route, zooms in, tilts a little and turns so the route runs up the
 * screen.
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
 * Whether the camera is on the route is published on `routeNavigation`, for
 * the camera restriction, which lets the map turn while it is.
 *
 * The start of the route is where the user is: the origin search hands the
 * user's own position to the ranking as its default starting point, so the
 * first coordinate of a driven route already is the current location, and
 * the addon asks the device for nothing. A route from a picked address starts
 * at that address, which is right as well.
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
 * MapLibre only: without a MapLibre map `start` does nothing.
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
  } = config ?? {};

  const [route] = useActiveRoute();
  // a producer keeps the coordinates stable per route, so their identity is
  // what says "another route" without comparing every vertex
  const coordinates = route?.coordinates ?? null;

  // `start` is published once and called from the info box; what it needs is
  // read through refs so a new route or map does not republish the offer
  const mapRef = useRef(libreMap);
  mapRef.current = libreMap;
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;

  const [navigating, setNavigating] = useState(false);
  const navigatingRef = useRef(navigating);
  navigatingRef.current = navigating;

  /**
   * Counts the flights, so a `moveend` of a leave that was overtaken by a new
   * `start` does not end the navigation that start just began.
   */
  const flightRef = useRef(0);

  /**
   * Takes the camera off the route: back to north-up and flat, which is the
   * view the restriction locks to, and then ends the navigation. The order
   * matters: `navigating` stays true until the camera is flat, because the
   * restriction re-locks the moment it flips and would snap the camera there
   * instead of letting it ease.
   *
   * Eased when the user asks for it, instant when the route goes away
   * underneath (a new starting point, another pick): whoever took the route
   * is about to move the map, and a flight of ours would be cut by theirs.
   */
  const leave = useCallback(
    (animate: boolean) => {
      const map = mapRef.current;
      const flight = ++flightRef.current;
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

  const start = useCallback(() => {
    const map = mapRef.current;
    const current = coordinatesRef.current;
    if (!map || !current) {
      return;
    }
    const target = routeCameraTarget(current, lookAheadMeters);
    if (!target) {
      return;
    }
    flightRef.current++;
    // the restriction reads `navigating` and unlocks the camera on it; that
    // write lands before the ease starts moving, so the bearing sticks
    setNavigating(true);
    map.easeTo({
      center: target.center,
      zoom,
      bearing: target.bearing,
      pitch,
      duration,
    });
  }, [zoom, pitch, lookAheadMeters, duration]);

  const stop = useCallback(() => {
    leave(true);
  }, [leave]);

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
    publishNavigation({ navigation: { navigating, start, stop } });
  }, [publishNavigation, navigating, start, stop]);
  // the offer goes with the addon, so a route without it shows no button
  useEffect(
    () => () => publishNavigation({ navigation: null }),
    [publishNavigation]
  );

  return null;
};
