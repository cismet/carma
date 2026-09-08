import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import type { RouteMode } from "./routeMode";

/**
 * Two channels, one for the route and one for going along it.
 *
 * `activeRoute` is the route the user is looking at. Named after what the
 * value is, not after who wrote it: "In der Nähe" publishes the route of the
 * hit that is picked today, a routing search will publish its own tomorrow,
 * and everything downstream reads one channel either way. Nothing moves the
 * camera on it; it only says "there is a route for this", which is what makes
 * the info box offer a button.
 *
 * `routeNavigation` is that offer, published by the `routing` addon: whether
 * the camera is on the route right now, and the two calls that put it there
 * and take it off again. The info box reads it and renders the button; the
 * camera restriction reads it and lets the map turn while `navigating`.
 *
 * `null` is a value on both: the route is gone, or nothing is mounted that
 * could navigate.
 */

export type ActiveRoute = {
  /** who published it, e.g. "nearestFeature"; for dev tools and later UI */
  source: string;
  /** the line from start to destination, `[lng, lat]` in WGS84 */
  coordinates: [number, number][];
  /** what the destination is called, when the producer knows */
  label?: string;
  /**
   * What it takes to get there, when the producer routed rather than measured:
   * a line the routing service drove has a time and a length, a straight line
   * has neither, and a summary is only shown for the former.
   */
  durationInSeconds?: number;
  distanceInMeters?: number;
  /** how the route was computed, for the icon in front of the summary */
  mode?: RouteMode;
};

export type ActiveRouteState = {
  /** the route in focus; null while there is none */
  route: ActiveRoute | null;
};

const EMPTY_STATE: ActiveRouteState = { route: null };

/** the route in focus, and the setter a producer publishes it with */
export const useActiveRoute = (): [
  ActiveRoute | null,
  (route: ActiveRoute | null) => void
] => {
  const [state, publish] = useAddonState("activeRoute");
  const setRoute = useCallback(
    (route: ActiveRoute | null) =>
      publish((previous) => {
        // the same route again is not news; keeping the state object keeps
        // every reader from re-rendering and the consumer from flying twice
        if ((previous ?? EMPTY_STATE).route === route) {
          return previous ?? EMPTY_STATE;
        }
        return { route };
      }),
    [publish]
  );
  return [state?.route ?? null, setRoute];
};

export type RouteNavigation = {
  /** the camera is on the route right now */
  navigating: boolean;
  /** ease the camera onto the route in focus; does nothing without one */
  start: () => void;
  stop: () => void;
};

export type RouteNavigationState = {
  /** the offer to navigate; null while no routing addon is mounted */
  navigation: RouteNavigation | null;
};

/** the offer to navigate, for the UI that renders the button */
export const useRouteNavigation = (): RouteNavigation | null => {
  const [state] = useAddonState("routeNavigation");
  return state?.navigation ?? null;
};
