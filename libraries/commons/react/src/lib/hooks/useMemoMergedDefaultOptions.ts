import { useMemo } from "react";
import { normalizeOptions } from "@carma-commons/utils";

/**
 * Custom hook to merge provided options with default options, memoizing the result.
 * Uses normalizeOptions to filter out undefined values from user-provided options.
 * If user-provided options are undefined, defaultOptions is returned directly.
 * User options will override default options.
 *
 * @template T - The type of the options object.
 * @param {Partial<T> | undefined} options - The user-provided options.
 * @param {Required<T>} defaultOptions - The default options.
 * @param {boolean} allowUndefinedAsValue - Whether to allow undefined values from options (default: false)
 * @returns {Required<T>} The merged options object.
 */
export function useMemoMergedDefaultOptions<T extends object>(
  options: Partial<T> | undefined,
  defaultOptions: Required<T>,
  allowUndefinedAsValue: boolean = false
): Required<T> {
  return useMemo(
    () => normalizeOptions(options, defaultOptions, allowUndefinedAsValue),
    [options, defaultOptions, allowUndefinedAsValue]
  );
}
