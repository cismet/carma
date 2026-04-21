import { useEffect, useRef } from "react";
import type { RefObject, MutableRefObject } from "react";

interface UseScrollToSelectedOptions {
  selectedId: number | string | null;
  containerRef: RefObject<HTMLDivElement>;
  fromListRef: MutableRefObject<boolean>;
  active?: boolean;
}

export function useScrollToSelected({
  selectedId,
  containerRef,
  fromListRef,
  active = true,
}: UseScrollToSelectedOptions) {
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || selectedId == null) return;

    if (fromListRef.current) {
      fromListRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const el = selectedItemRef.current;
      const container = containerRef.current;
      if (!el || !container) return;

      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const isVisible =
        elRect.top >= containerRect.top &&
        elRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedId, active, containerRef, fromListRef]);

  return selectedItemRef;
}
