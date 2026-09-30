import {
  RelayError,
  helloRelay,
  isSeriesStatus,
  seriesStatusTarget,
  waitRelayState,
  type HeardSeriesStatus,
  type RelayTarget,
} from "@carma-mapping/show-remote";

import { sleep as realSleep } from "./display-link";

/** the relay's longest hold, see `MAX_WAIT_MS` in `services/map-relay` */
const LONG_POLL_WAIT_MS = 25_000;
const RETRY_BASE_MS = 500;
const RETRY_CEILING_MS = 10_000;
/** the relay blocks a device for a minute after too many unknown codes */
const BLOCKED_WAIT_MS = 60_000;

const LOG_PREFIX = "[PM REMOTE SERIES]";

type Link = {
  hello: typeof helloRelay;
  wait: typeof waitRelayState;
  sleep: (ms: number) => Promise<void>;
};

const REAL_LINK: Link = {
  hello: helloRelay,
  wait: waitRelayState,
  sleep: realSleep,
};

/**
 * Listens to what the display says about its time series (`SeriesStatus`)
 * until the returned function is called. Every answer of the relay goes to
 * `onStatus`, `null` when the session holds no status: a display that runs no
 * series, or one from before the status existed.
 *
 * The hello opens the session first: reading one nobody opened counts as
 * guessing at the relay. A relay that forgot it (a restart) gets another.
 */
export const followSeriesStatus = (
  target: RelayTarget,
  onStatus: (heard: HeardSeriesStatus | null) => void,
  link: Link = REAL_LINK
): (() => void) => {
  const session = seriesStatusTarget(target);
  const controller = new AbortController();
  let running = true;

  void (async () => {
    let isOpen = false;
    let version = -1;
    let backoff = RETRY_BASE_MS;
    while (running) {
      try {
        if (!isOpen) {
          await link.hello(session);
          isOpen = true;
        }
        const answer = await link.wait(
          session,
          version,
          LONG_POLL_WAIT_MS,
          controller.signal
        );
        if (!running) {
          return;
        }
        backoff = RETRY_BASE_MS;
        version = answer.v;
        onStatus(
          isSeriesStatus(answer.state)
            ? {
                status: answer.state,
                // the age on the relay's clock, which this phone's may not match
                writtenAt: Date.now() - Math.max(0, answer.now - answer.ts),
              }
            : null
        );
      } catch (error) {
        if (!running) {
          return;
        }
        const status = error instanceof RelayError ? error.status : undefined;
        if (status === 404) {
          isOpen = false;
          version = -1;
        }
        console.warn(`${LOG_PREFIX} listening to the display failed`, error);
        await link.sleep(status === 429 ? BLOCKED_WAIT_MS : backoff);
        backoff = Math.min(backoff * 2, RETRY_CEILING_MS);
      }
    }
  })();

  return () => {
    running = false;
    controller.abort();
  };
};
