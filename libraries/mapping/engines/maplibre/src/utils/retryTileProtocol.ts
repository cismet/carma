import type { AddProtocolAction, RequestParameters } from "maplibre-gl";

/**
 * MapLibre asks for a tile exactly once. A tile whose transfer breaks or whose
 * host answers 5xx is marked errored and stays a hole until the source is
 * reloaded. Sources that must not go stale (the terrain DEM) route their tile
 * URLs through this protocol, which fetches with backoff until the data
 * arrives, the server confirms the tile is unavailable, or MapLibre aborts
 * the request.
 */
export const RETRY_TILE_PROTOCOL = "carma-retry";

const PROTOCOL_PREFIX = `${RETRY_TILE_PROTOCOL}://`;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 8_000;
/** Tries per tile, the first one included. */
const RETRY_MAX_ATTEMPTS = 12;

export const withRetryTileProtocol = (url: string): string =>
  url.startsWith(PROTOCOL_PREFIX) ? url : `${PROTOCOL_PREFIX}${url}`;

export const stripRetryTileProtocol = (url: string): string =>
  url.startsWith(PROTOCOL_PREFIX) ? url.slice(PROTOCOL_PREFIX.length) : url;

/** A refusal is the server's answer to this tile; only a broken transfer or an overloaded host is worth another try. */
const isConfirmedServerError = (status: number): boolean =>
  status >= 400 && status < 500 && status !== 408 && status !== 429;

const waitWithSignal = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

const buildStatusError = (url: string, status: number): Error => {
  const error = new Error(
    `Tile request failed with status ${String(status)}: ${url}`
  ) as Error & { status: number };
  error.status = status;
  return error;
};

export const fetchTileWithRetry = async (
  requestParameters: RequestParameters,
  abortController: AbortController,
  fetchImpl: typeof fetch = fetch
): Promise<{ data: ArrayBuffer; cacheControl?: string; expires?: string }> => {
  const url = stripRetryTileProtocol(requestParameters.url);
  const { signal } = abortController;
  let lastError: unknown;
  for (let attempt = 0; ; attempt += 1) {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
    try {
      const response = await fetchImpl(url, {
        headers: requestParameters.headers,
        credentials: requestParameters.credentials,
        signal,
      });
      if (response.ok) {
        // Read the body inside the attempt: a reset stream fails here, after
        // the headers already said 200.
        const data = await response.arrayBuffer();
        return {
          data,
          cacheControl: response.headers.get("Cache-Control") ?? undefined,
          expires: response.headers.get("Expires") ?? undefined,
        };
      }
      if (isConfirmedServerError(response.status)) {
        throw buildStatusError(url, response.status);
      }
      lastError = buildStatusError(url, response.status);
    } catch (error) {
      if (signal.aborted) throw error;
      if ((error as { status?: number }).status !== undefined) {
        if (isConfirmedServerError((error as { status: number }).status)) {
          throw error;
        }
      }
      lastError = error;
    }
    if (attempt + 1 >= RETRY_MAX_ATTEMPTS) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`Tile request failed: ${url}`);
    }
    const backoff = Math.min(
      RETRY_MAX_DELAY_MS,
      RETRY_BASE_DELAY_MS * 2 ** attempt
    );
    // Jittered so tiles that failed together do not return as one burst.
    await waitWithSignal(backoff * (0.5 + Math.random()), signal);
  }
};

export const retryTileProtocol: AddProtocolAction = (
  requestParameters,
  abortController
) => fetchTileWithRetry(requestParameters, abortController);
