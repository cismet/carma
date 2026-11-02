import {
  isSeriesStatus,
  seriesStatusTarget,
  subscribeRelay,
  type HeardSeriesStatus,
  type RelayLink,
  type RelayTarget,
} from "@carma-mapping/show-remote";

/**
 * Listens to what the display says about its time series (`SeriesStatus`)
 * until the returned function is called. Every new version goes to
 * `onStatus`, `null` when the session holds no status: a display that runs no
 * series, or one from before the status existed.
 */
export const followSeriesStatus = (
  target: RelayTarget,
  onStatus: (heard: HeardSeriesStatus | null) => void,
  link?: RelayLink
): (() => void) => {
  const subscription = subscribeRelay({
    target: seriesStatusTarget(target),
    onState: (state, { ageMs }) =>
      onStatus(
        isSeriesStatus(state)
          ? {
              status: state,
              // the age on the relay's clock, which this phone's may not match
              writtenAt: Date.now() - ageMs,
            }
          : null
      ),
    ...(link ? { link } : {}),
  });
  return subscription.stop;
};
