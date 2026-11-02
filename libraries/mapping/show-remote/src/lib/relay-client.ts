/**
 * Client of the map-relay protocol (`services/map-relay`) for both sides: a
 * writer replaces the whole desired state of a session, a follower
 * (`subscribeRelay`) hears every new version of it.
 *
 * Every request stays CORS-simple: the body goes out as `text/plain`, which
 * the relay parses as JSON regardless, so the browser never sends a preflight.
 */

export type RelayTarget = {
  /** e.g. https://relay-wupp-digitaltwin.cismet.de, no trailing path */
  baseUrl: string;
  /** session code; case-insensitive, the relay upper-cases it */
  code: string;
};

export type RelayWriteResult = { v: number; ts: number };

export type RelayReadResult = { v: number; state: unknown };

export class RelayError extends Error {
  readonly status: number | undefined;
  /** what the session holds now, when a write with `ifV` came too late (409) */
  readonly current: RelayReadResult | undefined;

  constructor(message: string, status?: number, current?: RelayReadResult) {
    super(message);
    this.name = "RelayError";
    this.status = status;
    this.current = current;
  }
}

const isReadResult = (value: unknown): value is RelayReadResult =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>)["v"] === "number" &&
  "state" in value;

const sessionUrl = ({ baseUrl, code }: RelayTarget): string =>
  `${baseUrl.replace(/\/+$/, "")}/s/${encodeURIComponent(code.trim())}`;

const describeStatus = (status: number): string => {
  if (status === 404) {
    return "the relay does not know this session code";
  }
  if (status === 429) {
    return "the relay blocks this device for a minute after too many unknown codes";
  }
  if (status === 413) {
    return "the state is too large for the relay";
  }
  if (status === 409) {
    return "somebody else wrote the session in the meantime";
  }
  return `the relay answered HTTP ${status}`;
};

/**
 * None of these requests waits on the relay's side, so an answer that takes
 * longer is lost on the way. Without a limit such a request stays open, and a
 * writer that sends one request at a time never sends again.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

const request = async (
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new RelayError(`the relay did not answer within ${timeoutMs} ms`);
    }
    throw new RelayError(
      `the relay is not reachable (${
        error instanceof Error ? error.message : String(error)
      })`
    );
  }
  if (response.status === 409) {
    const current: unknown = await response.json().catch(() => undefined);
    throw new RelayError(
      describeStatus(409),
      409,
      isReadResult(current) ? { v: current.v, state: current.state } : undefined
    );
  }
  if (!response.ok) {
    throw new RelayError(describeStatus(response.status), response.status);
  }
  return response.json() as Promise<unknown>;
};

/**
 * Replace the session's state; displays apply it on their next poll. With
 * `ifV` the relay only takes it while the session is still at that version,
 * and otherwise answers 409 with what it holds (`RelayError.current`).
 */
export const writeRelayState = async (
  target: RelayTarget,
  state: unknown,
  timeoutMs?: number,
  ifV?: number
): Promise<RelayWriteResult> =>
  (await request(
    sessionUrl(target),
    {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(ifV === undefined ? { state } : { state, ifV }),
    },
    timeoutMs
  )) as RelayWriteResult;

/**
 * Replace the session's state while the page goes away: the browser keeps the
 * request going after the page is gone, which a plain write does not get.
 * Best effort, nobody hears the answer.
 */
export const writeRelayStateOnExit = (
  target: RelayTarget,
  state: unknown
): void => {
  request(sessionUrl(target), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ state }),
    keepalive: true,
  }).catch(() => undefined);
};

/** The session's current state, without waiting for a change. */
export const readRelayState = async (
  target: RelayTarget
): Promise<RelayReadResult> =>
  (await request(`${sessionUrl(target)}?since=-1`, {
    method: "GET",
  })) as RelayReadResult;

/** Tell the relay a remote is active, which puts polling displays on the fast rate. */
export const helloRelay = async (target: RelayTarget): Promise<void> => {
  await request(`${sessionUrl(target)}/hello`, { method: "POST" });
};

/**
 * A session as the relay hands it to a reader: `ts` is when it was last
 * written and `now` when this answer left, both on the relay's clock, so their
 * difference is the state's age whatever this device's clock says.
 */
export type RelaySnapshot = {
  v: number;
  state: unknown;
  ts: number;
  now: number;
  /** a remote was active within the last minute */
  hot?: boolean;
  /** how long a short-polling reader should wait before asking again */
  pollAfterMs?: number;
};

/** how much longer than the relay's hold an answer may take on the way */
const WAIT_MARGIN_MS = 7_000;

/**
 * The session's state once its version differs from `since`, or unchanged
 * after the relay held the request `waitMs` (long polling). `signal` ends the
 * wait early, e.g. when the reader goes away.
 */
export const waitRelayState = async (
  target: RelayTarget,
  since: number,
  waitMs: number,
  signal?: AbortSignal
): Promise<RelaySnapshot> => {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, waitMs + WAIT_MARGIN_MS);
  signal?.addEventListener("abort", abort);
  let response: Response;
  try {
    response = await fetch(
      `${sessionUrl(target)}?since=${since}&wait=${Math.max(0, waitMs)}`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new RelayError(describeStatus(response.status), response.status);
    }
    return (await response.json()) as RelaySnapshot;
  } catch (error) {
    if (error instanceof RelayError) {
      throw error;
    }
    throw new RelayError(
      timedOut
        ? `the relay did not answer within ${waitMs + WAIT_MARGIN_MS} ms`
        : `the relay is not reachable (${
            error instanceof Error ? error.message : String(error)
          })`
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
};

/** the relay's longest hold, see `MAX_WAIT_MS` in `services/map-relay` */
export const RELAY_LONG_POLL_WAIT_MS = 25_000;
const RETRY_BASE_MS = 500;
const RETRY_CEILING_MS = 10_000;
/** the relay blocks a device for a minute after too many unknown codes */
const BLOCKED_WAIT_MS = 60_000;
/** held requests dying this often means a proxy will not tolerate them */
const MAX_LONG_POLL_FAILURES = 3;
/** a short poll waits this long when the relay gives no hint */
const DEFAULT_POLL_AFTER_MS = 1_000;
/** a long poll that comes back faster than this was not held, so it timed the network */
const MEANINGFUL_RTT_MS = 2_000;

const LOG_PREFIX = "[RELAY CLIENT]";

export type RelayTransport = "longpoll" | "poll";

export type RelayStatus = {
  transport: RelayTransport;
  connected: boolean;
  /** null until a request returned promptly enough for the number to mean anything */
  rttMs: number | null;
  v: number;
};

export type RelayMeta = {
  v: number;
  /** how long ago the state was written, on the relay's clock */
  ageMs: number;
  /** the first version this follower heard */
  first: boolean;
  transport: RelayTransport;
};

export type RelaySubscription = {
  stop: () => void;
  status: () => RelayStatus;
};

/** the requests a follower makes, replaceable in tests */
export type RelayLink = {
  hello: typeof helloRelay;
  wait: typeof waitRelayState;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

const REAL_LINK: RelayLink = {
  hello: helloRelay,
  wait: waitRelayState,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

export type SubscribeRelayOptions = {
  target: RelayTarget;
  /**
   * Every new version of the session, `null` while nobody wrote one. A
   * throwing handler is logged and does not end the subscription.
   */
  onState: (state: unknown, meta: RelayMeta) => void;
  onStatus?: (status: RelayStatus) => void;
  link?: RelayLink;
};

/**
 * Follows a session until `stop` is called. It opens the session with a hello
 * first, since reading one nobody opened counts as guessing at the relay, and
 * opens it again when the relay forgot it (a restart). Long polling, which
 * hears a change after about one round trip, falls back to short polling for
 * good when held requests keep dying on the way. Nothing makes it give up.
 */
export const subscribeRelay = ({
  target,
  onState,
  onStatus,
  link = REAL_LINK,
}: SubscribeRelayOptions): RelaySubscription => {
  const controller = new AbortController();
  let running = true;
  const status: RelayStatus = {
    transport: "longpoll",
    connected: false,
    rttMs: null,
    v: 0,
  };
  const report = (patch: Partial<RelayStatus>) => {
    Object.assign(status, patch);
    onStatus?.({ ...status });
  };

  void (async () => {
    let isOpen = false;
    let version = -1;
    let failures = 0;
    let backoff = RETRY_BASE_MS;
    while (running) {
      try {
        if (!isOpen) {
          await link.hello(target);
          isOpen = true;
          if (!running) {
            return;
          }
        }
        const longPoll = status.transport === "longpoll";
        const startedAt = link.now();
        const answer = await link.wait(
          target,
          version,
          longPoll ? RELAY_LONG_POLL_WAIT_MS : 0,
          controller.signal
        );
        if (!running) {
          return;
        }
        const rtt = link.now() - startedAt;
        failures = 0;
        backoff = RETRY_BASE_MS;
        report({
          connected: true,
          v: answer.v,
          rttMs: !longPoll || rtt < MEANINGFUL_RTT_MS ? rtt : status.rttMs,
        });
        if (answer.v !== version) {
          const first = version === -1;
          version = answer.v;
          try {
            onState(answer.state ?? null, {
              v: answer.v,
              ageMs: Math.max(0, answer.now - answer.ts),
              first,
              transport: status.transport,
            });
          } catch (error) {
            console.error(`${LOG_PREFIX} applying state threw`, error);
          }
        }
        if (!longPoll) {
          await link.sleep(answer.pollAfterMs ?? DEFAULT_POLL_AFTER_MS);
        }
      } catch (error) {
        if (!running) {
          return;
        }
        const httpStatus =
          error instanceof RelayError ? error.status : undefined;
        report({ connected: false });
        console.warn(`${LOG_PREFIX} following ${target.code} failed`, error);
        if (httpStatus === 429) {
          await link.sleep(BLOCKED_WAIT_MS);
          continue;
        }
        if (httpStatus === 404) {
          isOpen = false;
          version = -1;
        } else if (
          httpStatus === undefined &&
          status.transport === "longpoll"
        ) {
          failures++;
          if (failures >= MAX_LONG_POLL_FAILURES) {
            failures = 0;
            report({ transport: "poll" });
            console.warn(
              `${LOG_PREFIX} long polling unreliable here, falling back to short polling`
            );
            continue;
          }
        }
        await link.sleep(backoff);
        backoff = Math.min(backoff * 2, RETRY_CEILING_MS);
      }
    }
  })();

  return {
    stop: () => {
      running = false;
      controller.abort();
    },
    status: () => ({ ...status }),
  };
};
