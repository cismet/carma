// ─────────────────────────────────────────────────────────────
//  RetryFetchPlugin: fetch a tile again when the connection drops it.
//
//  The tile host resets HTTP/2 streams under concurrent load. The response
//  headers arrive and say 200, then the body stops partway and the browser
//  reports `ERR_HTTP2_PROTOCOL_ERROR 200 (OK)`. Measured from a plain client
//  against `wupp-3d-data.cismet.de`, this costs a few percent of requests once
//  enough streams share one connection, in bursts rather than evenly.
//
//  The renderer has no answer for it. A tile that fails is set to FAILED and
//  left in the cache marked loaded, and `queueTileForDownload` only accepts
//  tiles in UNLOADED, so it is never asked for again until it happens to be
//  evicted. One dropped stream is one patch of the city that stays coarse for
//  as long as the cache holds the tile. That is what turns a small loss rate
//  into a visibly broken surface.
//
//  Retrying has to happen here rather than around the renderer because `fetch`
//  resolves as soon as the headers are in, which for this failure is before
//  anything has gone wrong. The error only surfaces while the body is read, so
//  the body is read here, inside the attempt, and what goes back is a Response
//  built from bytes already in hand. `TilesRendererBase` accepts that: it
//  checks `res.ok` and then calls `json()` or `arrayBuffer()`, both of which a
//  buffered Response answers the same way.
// ─────────────────────────────────────────────────────────────

export interface RetryFetchPluginOptions {
  /** Total tries per URL, the first one included. */
  attempts?: number;
  /** Delay before the second try; each further wait doubles it. */
  baseDelayMs?: number;
  /** Upper bound on that delay, so a long backoff cannot outlive the view. */
  maxDelayMs?: number;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 150;
const DEFAULT_MAX_DELAY_MS = 2_000;

/** A refused tile is refused for good; only a broken connection is worth another try. */
function isWorthRetrying(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class RetryFetchPlugin {
  readonly name = "RETRY_FETCH_PLUGIN";

  private readonly attempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: RetryFetchPluginOptions = {}) {
    this.attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_ATTEMPTS));
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
    this.maxDelayMs = Math.max(
      this.baseDelayMs,
      options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
    );
  }

  async fetchData(url: string, options: RequestInit): Promise<Response> {
    const signal = options.signal ?? null;
    let lastError: unknown;

    for (let attempt = 0; attempt < this.attempts; attempt++) {
      if (signal?.aborted) {
        throw (signal.reason as Error | undefined) ?? new Error("aborted");
      }

      try {
        const response = await fetch(url, options);

        // A refusal is the server's answer, not a broken pipe. Hand it back and
        // let the renderer report it; retrying a 404 only delays the failure.
        if (!response.ok && !isWorthRetrying(response.status)) {
          return response;
        }

        if (response.ok) {
          // The read is inside the try on purpose. This is where a reset
          // stream throws, and it is the whole reason the plugin exists.
          const body = await response.arrayBuffer();
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }

        lastError = new Error(
          `Failed to load tile, status ${response.status.toString()}`
        );
      } catch (error) {
        // An abort is the renderer changing its mind, not a failure to retry.
        if (signal?.aborted) {
          throw error;
        }
        lastError = error;
      }

      const isLastAttempt = attempt === this.attempts - 1;
      if (!isLastAttempt) {
        // Jittered, so a burst of tiles that failed together does not come
        // back in the same burst and reproduce the load that dropped them.
        const backoff = Math.min(
          this.maxDelayMs,
          this.baseDelayMs * 2 ** attempt
        );
        await wait(backoff * (0.5 + Math.random()), signal);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to load tile at ${url}`);
  }
}
