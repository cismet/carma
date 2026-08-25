import { useCallback, useEffect, useRef } from "react";

import { useAddonState } from "../../lib/AddonStateContext";

/**
 * The `originLocation` channel: where the user starts from.
 *
 * The counterpart of the app's own search, which says where to go. Nothing
 * about it belongs to one consumer: "In der Nähe" ranks from the origin today,
 * a routing UI will draw a route from it, and both read the same channel.
 *
 * `requests` is what keeps the input out of the way until it is useful. A
 * consumer registers its key while it wants an origin ("In der Nähe" does so
 * once it has ranked a category) and takes it out again when it unmounts; the
 * `originSearch` addon renders while at least one request stands. A record
 * rather than a counter, so several consumers ask side by side without
 * overwriting each other, and so the reason is on screen in dev tools.
 */

export type OriginLocation = {
  lat: number;
  lng: number;
  /** what the input shows for it, e.g. "Rathaus Wuppertal" */
  label: string;
};

export type OriginLocationState = {
  /** the current starting point; null until something publishes one */
  origin: OriginLocation | null;
  /** who wants the origin input on screen right now: key -> why */
  requests: Record<string, string>;
};

const EMPTY_STATE: OriginLocationState = { origin: null, requests: {} };

/** the current origin, and the setter the origin search writes it with */
export const useOriginLocation = (): [
  OriginLocation | null,
  (origin: OriginLocation | null) => void
] => {
  const [state, publish] = useAddonState("originLocation");
  const setOrigin = useCallback(
    (origin: OriginLocation | null) =>
      publish((previous) => ({ ...(previous ?? EMPTY_STATE), origin })),
    [publish]
  );
  return [state?.origin ?? null, setOrigin];
};

/** the whole channel, for the addon that renders on a request */
export const useOriginLocationState = (): OriginLocationState => {
  const [state] = useAddonState("originLocation");
  return state ?? EMPTY_STATE;
};

/**
 * Ask for the origin input while `active` holds, under a key of one's own.
 *
 * The reason is read from a ref, so rewording it does not re-register; the
 * request is taken out again when the caller unmounts, which is what makes a
 * route without any consumer show no input at all.
 */
export const useOriginRequest = (
  key: string,
  reason: string,
  active = true
) => {
  const [, publish] = useAddonState("originLocation");
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
