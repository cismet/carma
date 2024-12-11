import { useEffect, useRef } from "react";

export const useOutsideClick = (callback: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const ifSelectClicked = (event.target as HTMLElement).classList.contains(
        "ant-select-item-option-content"
      );
      if (
        ref.current &&
        !ref.current.contains(event.target as Node) &&
        !ifSelectClicked
      ) {
        callback();
      }
    };

    document.addEventListener("mouseup", handleClickOutside);
    document.addEventListener("touchend", handleClickOutside);

    return () => {
      document.removeEventListener("mouseup", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
    };
  }, [callback]);

  return ref;
};
