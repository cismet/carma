/**
 * Resolves to the original promise result or a timeout fallback after `timeoutMs`.
 * Rejects only if the original promise rejects before the timeout.
 */
export const promiseWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  options?: {
    onTimeoutResolveWith?: () => T;
    timeoutValue?: T;
  }
): Promise<T | undefined> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  const { onTimeoutResolveWith, timeoutValue } = options ?? {};

  return Promise.race([
    promise,
    new Promise<T | undefined>((resolve) => {
      setTimeout(() => {
        if (typeof onTimeoutResolveWith === "function") {
          resolve(onTimeoutResolveWith());
          return;
        }
        resolve(timeoutValue);
      }, timeoutMs);
    }),
  ]);
};
