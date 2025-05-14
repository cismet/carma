import { useMemo } from "react";

/**
 * Custom hook to merge provided options with default options, memoizing the result.
 * If user-provided options are undefined, defaultOptions is returned directly.
 * User options will override default options.
 *
 * @template T - The type of the options object.
 * @param {T | undefined} options - The user-provided options.
 * @param {T} defaultOptions - The default options.
 * @returns {T} The merged options object.
 */
export function useMemoMergedDefaultOptions<T extends object>(
  options: T | undefined,
  defaultOptions: T
): T {
  return useMemo(() => {
    if (!options) {
      return defaultOptions;
    }
    return { ...defaultOptions, ...options };
  }, [options, defaultOptions]);
}
