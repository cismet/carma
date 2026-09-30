import { styleFetchInit } from "./forcedCache";

export const STYLE_RESOURCE_TIMEOUT_MS = 5_000;

/** Bound both the connection and body read so a style cannot hold up the map. */
export const fetchStyleResource = async <T>(
  url: string,
  read: (response: Response) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Style resource timed out after ${STYLE_RESOURCE_TIMEOUT_MS} ms: ${url}`
        )
      );
      controller.abort();
    }, STYLE_RESOURCE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          ...styleFetchInit(),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `${response.status} ${response.statusText} for ${url}`
          );
        }
        return read(response);
      })(),
      deadline,
    ]);
  } finally {
    // A completed resource must not leave a timer or get aborted later.
    clearTimeout(timeoutId);
  }
};
