import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * A custom hook that compares the previous and current values of a variable
 * and calls a callback function when the value changes.
 *
 * @param {any} value - The current value to monitor.
 * @param {string} label - label for the value.
 */

export function useValueChange<T>(
  value: T,
  label: string,
) {
  const previousValueRef = useRef<T | undefined>(undefined);
  const isFirstRender = useRef<boolean>(true);

  const callback = useCallback((pV: unknown, v: unknown) => {
    const logMessage = `${label} changed`;
    console.log(logMessage, pV, v);
  }, [label]);

  useEffect(() => {
    if (!isFirstRender.current && previousValueRef.current !== value) {
      callback(previousValueRef.current as unknown as T, value);
    }
    previousValueRef.current = value;
    isFirstRender.current = false;
  }, [value, callback]);
}

export default useValueChange;
