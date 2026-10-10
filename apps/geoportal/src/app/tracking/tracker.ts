/**
 * Module level access to Matomo event tracking.
 *
 * `useMatomo` owns the actual tracking, including the CONSOLE/ONLINE mode that
 * the `tracking` feature flag selects. Most call sites are components that
 * could read the context directly, but the layer handling lives in plain
 * modules outside the component tree - so `MatomoTracker` registers its
 * `trackEvent` here once and every call site imports this function instead.
 */

export type TrackEventFn = (
  category: string,
  action: string,
  name?: string,
  value?: number
) => void;

let delegate: TrackEventFn | null = null;

export const setTrackEventDelegate = (fn: TrackEventFn | null) => {
  delegate = fn;
};

export const trackEvent: TrackEventFn = (category, action, name, value) => {
  if (!delegate) {
    // Only reachable for events fired before MatomoTracker has mounted.
    console.debug(
      "📈 no tracker registered, event dropped:",
      category,
      action,
      name
    );
    return;
  }
  delegate(category, action, name, value);
};
