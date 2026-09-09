/** Bound the two response readers used by TilesRenderer without copying bodies. */
export const fetchTileResponse = async (
  url: string | URL,
  options: RequestInit,
  timeoutMs = 30_000
): Promise<Response> => {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const read = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      // Fetch body consumption may report AbortError even for a timeout.
      // TilesRenderer intentionally ignores AbortError; normalize only OUR
      // deadline so it releases its loading slot and enters bounded retries.
      if (timeout.aborted && !options.signal?.aborted) throw timeout.reason;
      throw error;
    }
  };
  const response = await read(() => fetch(url, { ...options, signal }));
  // Retain Response identity, headers, URL and streaming behavior. Wrapping the
  // public readers avoids a second full buffer or a main-thread stream pump.
  // Decision: TILE-TRANSPORT-DEADLINE-20260909 in engines/maplibre/README.md.
  const arrayBuffer = response.arrayBuffer.bind(response);
  const json = response.json.bind(response);
  response.arrayBuffer = () => read(arrayBuffer);
  response.json = () => read(json);
  return response;
};
