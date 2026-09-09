/**
 * Where `LocateProvider` gets its positions from.
 *
 * The device by default. One slot in front of it, so a dev addon can put a
 * pretend device there and every reader of the locate context (the button,
 * the origin search, the routing camera) sees the pretend positions without
 * knowing: they all read `currentPosition`, and only the provider asks the
 * source. The same shape as the camera restriction override: one module-level
 * slot, the last writer wins, and a writer clears it when it goes.
 *
 * Read at call time by the provider, not at mount: the source may be set
 * after the provider is already there, and switching the location mode off
 * and on again is what picks the new one up.
 */

/** the part of `Geolocation` the provider uses */
export type GeolocationSource = Pick<
  Geolocation,
  "getCurrentPosition" | "watchPosition" | "clearWatch"
>;

let override: GeolocationSource | null = null;

/** the pretend device; `null` hands the slot back to the real one */
export const setGeolocationSource = (source: GeolocationSource | null) => {
  override = source;
};

/** the source to ask now; `null` when this browser has no geolocation at all */
export const getGeolocationSource = (): GeolocationSource | null => {
  if (override) {
    return override;
  }
  return typeof navigator !== "undefined" && navigator.geolocation
    ? navigator.geolocation
    : null;
};
