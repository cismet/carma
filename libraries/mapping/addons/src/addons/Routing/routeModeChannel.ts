import { useCallback, useEffect, useRef } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import type { RouteMode } from "./routeMode";

/**
 * The `routeMode` channel: how the user travels.
 *
 * The "womit?" next to the origin's "von wo?" and the app's own "wohin?".
 * Nothing about it belongs to one consumer: "In der Nähe" ranks its candidates
 * by it today, a routing UI will compute its route by it, and both read the
 * same channel. The `routeModePicker` addon writes it.
 *
 * `requests` keeps the picker out of the way until it is useful, exactly as
 * the origin channel keeps its input: a consumer registers its key while it
 * wants a mode ("In der Nähe" does so once it has ranked a category) and takes
 * it out again when it unmounts; the picker renders while at least one request
 * stands.
 *
 * The channel starts at `DEFAULT_ROUTE_MODE`, so a consumer on a route without
 * the picker reads the same mode it always used.
 */

export const DEFAULT_ROUTE_MODE: RouteMode = "car";

export type RouteModeState = {
  /** how the user travels */
  mode: RouteMode;
  /** who wants the picker on screen right now: key -> why */
  requests: Record<string, string>;
};

const EMPTY_STATE: RouteModeState = {
  mode: DEFAULT_ROUTE_MODE,
  requests: {},
};

/** the current mode, and the setter the picker writes it with */
export const useRouteMode = (): [RouteMode, (mode: RouteMode) => void] => {
  const [state, publish] = useAddonState("routeMode");
  const setMode = useCallback(
    (mode: RouteMode) =>
      publish((previous) => {
        // the same mode again is not news; keeping the state object keeps
        // every reader from re-rendering and a ranking from running twice
        if ((previous ?? EMPTY_STATE).mode === mode) {
          return previous ?? EMPTY_STATE;
        }
        return { ...(previous ?? EMPTY_STATE), mode };
      }),
    [publish]
  );
  return [state?.mode ?? DEFAULT_ROUTE_MODE, setMode];
};

/** the whole channel, for the addon that renders on a request */
export const useRouteModeState = (): RouteModeState => {
  const [state] = useAddonState("routeMode");
  return state ?? EMPTY_STATE;
};

/**
 * Ask for the mode picker while `active` holds, under a key of one's own.
 *
 * The reason is read from a ref, so rewording it does not re-register; the
 * request is taken out again when the caller unmounts, which is what makes a
 * route without any consumer show no picker at all.
 */
export const useRouteModeRequest = (
  key: string,
  reason: string,
  active = true
) => {
  const [, publish] = useAddonState("routeMode");
  const reasonRef = useRef(reason);
  reasonRef.current = reason;

  useEffect(() => {
    if (!active) {
      return;
    }
    publish((previous) => ({
      ...(previous ?? EMPTY_STATE),
      requests: { ...(previous?.requests ?? {}), [key]: reasonRef.current },
    }));
    return () => {
      publish((previous) => {
        if (!previous || !(key in previous.requests)) {
          return previous ?? EMPTY_STATE;
        }
        const requests = { ...previous.requests };
        delete requests[key];
        return { ...previous, requests };
      });
    };
  }, [publish, key, active]);
};
