import {
  SERIES_STATUS_HEARTBEAT_MS,
  type SeriesStatus,
} from "@carma-mapping/show-remote";

const LOG_PREFIX = "[OUTLET SERIES STATUS]";

export type SeriesStatusPublisher = {
  /** says `status` unless it is what was said last; `null`: no series on */
  publish: (status: SeriesStatus | null) => void;
  stop: () => void;
};

/**
 * Tells the remote where the time series stands (`SeriesStatus`), through
 * `write`. One request at a time, and only the newest status counts: while
 * one is out, a newer one replaces whatever waited behind it, so a series
 * loading 24 frames costs a request per round trip at most. A status is
 * repeated every `heartbeatMs`, so the remote can tell one that is current
 * from one a display left behind.
 */
export const createSeriesStatusPublisher = (
  write: (status: SeriesStatus | null) => Promise<unknown>,
  heartbeatMs: number = SERIES_STATUS_HEARTBEAT_MS
): SeriesStatusPublisher => {
  let running = true;
  let latest: { status: SeriesStatus | null; json: string } | null = null;
  let isSending = false;
  let isDirty = false;
  let hasWarned = false;

  const pump = () => {
    if (!running || !latest) {
      return;
    }
    if (isSending) {
      isDirty = true;
      return;
    }
    isSending = true;
    isDirty = false;
    write(latest.status)
      .then(
        () => {
          hasWarned = false;
        },
        (error: unknown) => {
          // once per outage; the heartbeat tries again
          if (!hasWarned) {
            hasWarned = true;
            console.warn(`${LOG_PREFIX} telling the remote failed`, error);
          }
        }
      )
      .finally(() => {
        isSending = false;
        if (isDirty) {
          pump();
        }
      });
  };

  const heartbeat = setInterval(() => {
    // no series on is said once; a series is repeated
    if (latest?.status && !isSending) {
      pump();
    }
  }, heartbeatMs);

  return {
    publish: (status) => {
      const json = JSON.stringify(status);
      if (latest?.json === json) {
        return;
      }
      latest = { status, json };
      pump();
    },
    stop: () => {
      running = false;
      clearInterval(heartbeat);
    },
  };
};
