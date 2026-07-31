/**
 * Display side of the map-relay protocol (`services/map-relay`).
 *
 * The remote writes a whole desired-state document and this side applies it
 * idempotently, so a reload, a reconnect or a late-joining display all end up
 * correct without anything having to be replayed. There is deliberately no
 * publisher here: the source window only ever reads.
 *
 * Transport starts as long polling (latency is roughly one round trip) and
 * silently falls back to short polling if the network mangles held requests.
 * Every request stays CORS-simple, no custom headers, so the browser never
 * fires a preflight.
 */

const LOG_PREFIX = "[OUTLET RELAY]";

/** server hold time; the client budget below has to exceed it */
const LONG_POLL_WAIT_MS = 25_000;
const LONG_POLL_BUDGET_MS = 32_000;
const SHORT_POLL_BUDGET_MS = 10_000;
const RETRY_BASE_MS = 500;
const RETRY_CEILING_MS = 10_000;
/** held requests dying this often means a proxy will not tolerate them */
const MAX_LONG_POLL_FAILURES = 3;

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
  /** how long ago the state was written, corrected for clock skew */
  ageMs: number;
  first: boolean;
  transport: RelayTransport;
};

type RelaySnapshot = {
  v: number;
  state: unknown;
  ts: number;
  now: number;
  hot: boolean;
  pollAfterMs: number;
};

export type RelaySubscription = {
  stop: () => void;
  status: () => RelayStatus;
};

type SubscribeOptions = {
  /** relay base url, e.g. http://localhost:8099 */
  base: string;
  /** session code; case-insensitive, the relay upper-cases it */
  code: string;
  onState: (state: unknown, meta: RelayMeta) => void;
  onStatus?: (status: RelayStatus) => void;
};

const join = (base: string, path: string): string =>
  String(base).replace(/\/+$/, "") + path;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const statusOf = (error: unknown): number | undefined =>
  typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: number }).status
    : undefined;

export const subscribe = ({
  base,
  code,
  onState,
  onStatus,
}: SubscribeOptions): RelaySubscription => {
  let running = true;
  let version = -1;
  let transport: RelayTransport = "longpoll";
  let failures = 0;
  let backoff = RETRY_BASE_MS;
  /** serverNow - clientNow, so state age survives a badly set client clock */
  let skew = 0;
  let controller: AbortController | null = null;

  const status: RelayStatus = {
    transport,
    connected: false,
    rttMs: null,
    v: 0,
  };
  const report = (patch: Partial<RelayStatus>) => {
    Object.assign(status, patch);
    onStatus?.({ ...status });
  };

  /** returns the delay before the next tick, or -1 to stop */
  const tick = async (): Promise<number> => {
    const wait = transport === "longpoll" ? LONG_POLL_WAIT_MS : 0;
    const url = join(
      base,
      `/s/${encodeURIComponent(code)}?since=${version}&wait=${wait}`
    );
    const budget =
      transport === "longpoll" ? LONG_POLL_BUDGET_MS : SHORT_POLL_BUDGET_MS;

    controller = new AbortController();
    const timer = setTimeout(() => {
      controller?.abort();
    }, budget);
    const startedAt = performance.now();

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      const rtt = Math.round(performance.now() - startedAt);
      if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status}`), {
          status: response.status,
        });
      }
      const data = (await response.json()) as RelaySnapshot;

      failures = 0;
      backoff = RETRY_BASE_MS;
      skew = data.now - Date.now();

      // For a short poll the round trip is the whole request; for a long poll it
      // is mostly hold time, so only believe it when the request came back fast.
      const rttMeaningful = transport === "poll" || rtt < 2000;

      if (data.v !== version) {
        const first = version === -1;
        version = data.v;
        report({
          connected: true,
          v: version,
          rttMs: rttMeaningful ? rtt : status.rttMs,
        });
        if (data.state !== null && data.state !== undefined) {
          const ageMs = Math.max(0, Math.round(Date.now() + skew - data.ts));
          try {
            onState(data.state, { v: version, ageMs, first, transport });
          } catch (error) {
            console.error(`${LOG_PREFIX} applying state threw`, error);
          }
        }
      } else {
        report({
          connected: true,
          rttMs: rttMeaningful ? rtt : status.rttMs,
        });
      }

      // Long poll: straight back in. Short poll: obey the server's hint.
      return transport === "longpoll" ? 0 : data.pollAfterMs || 1000;
    } catch (error) {
      if (!running) {
        return -1;
      }

      // A session that does not exist, or an IP that has been throttled for
      // guessing, will not start working by being asked again.
      const code = statusOf(error);
      if (code === 404 || code === 429) {
        report({ connected: false });
        console.warn(
          `${LOG_PREFIX} giving up: ${
            error instanceof Error ? error.message : String(error)
          }. Is the relay running, and does the session exist?`
        );
        running = false;
        return -1;
      }

      failures++;
      report({ connected: false });

      if (transport === "longpoll" && failures >= MAX_LONG_POLL_FAILURES) {
        transport = "poll";
        failures = 0;
        report({ transport });
        console.warn(
          `${LOG_PREFIX} long polling unreliable here, falling back to short polling`
        );
        return 0;
      }

      const delay = backoff;
      backoff = Math.min(backoff * 2, RETRY_CEILING_MS);
      return delay;
    } finally {
      clearTimeout(timer);
    }
  };

  void (async () => {
    while (running) {
      const delay = await tick();
      if (delay < 0) {
        break;
      }
      if (delay > 0) {
        await sleep(delay);
      }
    }
  })();

  return {
    stop: () => {
      running = false;
      try {
        controller?.abort();
      } catch {
        // aborting an already-finished request is not interesting
      }
    },
    status: () => ({ ...status }),
  };
};
