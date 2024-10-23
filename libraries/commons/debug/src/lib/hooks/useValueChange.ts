import { useEffect, useRef } from "react";

/**
 * A custom hook that compares the previous and current values of a variable
 * and calls a callback function when the value changes.
 *
 * @param {any} value - The current value to monitor.
 * @param {(prevValue: any, currentValue: any) => void} callback - The function to call when the value changes.
 */

export function useValueChange<T>(
  value: T,
  callback: (prevValue: T | undefined, currentValue: T) => void = (pV, v) => {
    console.log("monitored value changed", pV, v);
  },
) {
  const previousValueRef = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (previousValueRef.current !== value) {
      callback(previousValueRef.current, value);
    }
    previousValueRef.current = value;
  }, [value, callback]);
}

export default useValueChange;
