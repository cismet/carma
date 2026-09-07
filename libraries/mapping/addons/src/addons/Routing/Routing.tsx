import { useCallback, useEffect, useRef, useState } from "react";
import { faRoute } from "@fortawesome/free-solid-svg-icons";

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
 * Ending it moves nothing by itself; turning the map back north is the camera
 * restriction's job (`cameraRestriction` with `unlessNavigating`), the same
 * addon that allows the rotation in the first place, because a restricted
 * camera resets its bearing to zero.
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

  // the route this navigation was started on is not the one in focus any
  // more, or there is none: the navigation goes with it
  useEffect(() => {
    setNavigating(false);
  }, [coordinates]);

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
    setNavigating(false);
  }, []);

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
