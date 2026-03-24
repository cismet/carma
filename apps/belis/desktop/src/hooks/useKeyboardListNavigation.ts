import { useCallback } from "react";
import type React from "react";

interface UseKeyboardListNavigationOptions<T> {
  items: T[];
  selectedIndex: number;
  onSelect: (item: T, index: number) => void;
  enabled?: boolean;
}

export function useKeyboardListNavigation<T>({
  items,
  selectedIndex,
  onSelect,
  enabled = true,
}: UseKeyboardListNavigationOptions<T>) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (items.length === 0) return;

      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx =
          selectedIndex < 0 ? 0 : (selectedIndex + 1) % items.length;
      } else {
        nextIdx =
          selectedIndex < 0
            ? items.length - 1
            : (selectedIndex - 1 + items.length) % items.length;
      }
      onSelect(items[nextIdx], nextIdx);
    },
    [items, selectedIndex, onSelect, enabled]
  );

  return { onKeyDown: handleKeyDown };
}
