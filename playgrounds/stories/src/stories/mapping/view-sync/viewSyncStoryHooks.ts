import { useEffect, useRef, useState, type RefObject } from "react";

export const useElementWidth = (elementRef: RefObject<HTMLElement>) => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [elementRef]);

  return width;
};

export const useContainerResize = (
  containerRef: RefObject<HTMLElement>,
  onResize: () => void
) => {
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      onResizeRef.current();
    });

    observer.observe(container);
    onResizeRef.current();

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);
};

export const useDeferredBootReady = (enabled: boolean, delayMs: number = 0) => {
  const [isReady, setIsReady] = useState(!enabled || delayMs <= 0);

  useEffect(() => {
    if (!enabled) {
      setIsReady(false);
      return;
    }

    if (delayMs <= 0) {
      setIsReady(true);
      return;
    }

    setIsReady(false);

    let timeoutId: number | null = null;
    let idleId: number | null = null;
    let frameId: number | null = null;

    const activate = () => {
      setIsReady(true);
    };

    timeoutId = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(activate, {
          timeout: delayMs + 400,
        });
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        activate();
      });
    }, delayMs);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [delayMs, enabled]);

  return isReady;
};
