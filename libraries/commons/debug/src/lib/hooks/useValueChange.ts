import { useEffect, useMemo, useRef } from "react";

/**
 * A custom hook that compares the previous and current values of a variable
 * and calls a callback function when the value changes.
 *
 * @param {any} value - The current value to monitor.
 * @param {(prevValue: any, currentValue: any) => void} callback - The function to call when the value changes.
 */

export function useValueChange<T>(
  value: T,
  callbackOrString: (
    prevValue: T | undefined,
    currentValue: T,
  ) => void | string,
) {
  const previousValueRef = useRef<T | undefined>(undefined);
  const isFirstRender = useRef(true);

  const logMessage =
    typeof callbackOrString === "string"
      ? `${callbackOrString} changed`
      : "monitored value changed";

  const callback = useMemo(
    () =>
      typeof callbackOrString === "function"
        ? callbackOrString
        : (pV, v) => {
            console.log(logMessage, pV, v);
          },
    [logMessage, callbackOrString],
  );
  useEffect(() => {
    if (!isFirstRender.current && previousValueRef.current !== value) {
      callback(previousValueRef.current, value);
    }
    previousValueRef.current = value;
    isFirstRender.current = false;
  }, [value, callback]);
}

export default useValueChange;
