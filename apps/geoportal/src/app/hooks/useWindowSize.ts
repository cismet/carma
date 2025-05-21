import { useState, useEffect, RefObject, useMemo } from "react";
import { debounce } from "lodash";

interface WindowSize {
  width: number;
  height: number;
}

export const useWindowSize = (
  ref: RefObject<HTMLElement>,
  delay = 1000 / 30,
  minSize = 64, // Minimum size to prevent layout issues
  threshold = 2 // Minimum change in pixels to trigger update
): WindowSize => {
  const [size, setSize] = useState<WindowSize>({
    width: minSize,
    height: minSize,
  });

  // Create a debounced version of the size setter with threshold check
  const debouncedSetSize = useMemo(
    () =>
      debounce((newSize: WindowSize) => {
        setSize((prevSize) => {
          // Only update if change exceeds threshold
          const widthDiff = Math.abs(prevSize.width - newSize.width);
          const heightDiff = Math.abs(prevSize.height - newSize.height);

          if (widthDiff > threshold || heightDiff > threshold) {
            return newSize;
          }
          return prevSize;
        });
      }, delay),
    [delay, threshold]
  );

  useEffect(() => {
    if (!ref.current) return;
    const activeRef = ref.current; // store for cleanup

    const updateSize = () => {
      if (activeRef) {
        const width = Math.max(activeRef.clientWidth, minSize);
        const height = Math.max(activeRef.clientHeight, minSize);
        debouncedSetSize({ width, height });
      }
    };

    // Call immediately for initial size
    if (activeRef) {
      const width = Math.max(activeRef.clientWidth, minSize);
      const height = Math.max(activeRef.clientHeight, minSize);
      setSize({ width, height });
    }

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(activeRef);

    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", updateSize); // Added orientationchange listener

    return () => {
      debouncedSetSize.cancel(); // Cancel any pending debounce calls
      if (activeRef) {
        resizeObserver.unobserve(activeRef);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("orientationchange", updateSize); // Removed orientationchange listener
    };
  }, [ref, debouncedSetSize, minSize, threshold]);

  return size;
};
