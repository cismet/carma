import { useCallback, useEffect, useRef, useState } from "react";

export interface BgRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BgData {
  layerId: string;
  button: BgRect;
  filter: BgRect;
}

export function useFilterBackground(
  activeLayerId: string | undefined,
  isDragging?: boolean
) {
  const [bgData, setBgData] = useState<BgData | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const updateBg = useCallback(() => {
    if (!activeLayerId || !filterRef.current || !wrapperRef.current) {
      setBgData(null);
      return;
    }

    const buttonWrapper = document.getElementById(`layer-${activeLayerId}`);
    if (!buttonWrapper) {
      setBgData(null);
      return;
    }

    // Measure the inner LayerButton, not the outer wrapper div which can be wider
    const buttonEl =
      (buttonWrapper.firstElementChild as HTMLElement) ?? buttonWrapper;

    const wRect = wrapperRef.current.getBoundingClientRect();
    const bRect = buttonEl.getBoundingClientRect();
    const fRect = filterRef.current.getBoundingClientRect();

    setBgData({
      layerId: activeLayerId,
      button: {
        x: bRect.left - wRect.left,
        y: bRect.top - wRect.top,
        width: bRect.width,
        height: bRect.height,
      },
      filter: {
        x: fRect.left - wRect.left,
        y: fRect.top - wRect.top,
        width: fRect.width,
        height: fRect.height,
      },
    });
  }, [activeLayerId]);

  useEffect(() => {
    if (!activeLayerId || !filterRef.current) {
      setBgData(null);
      return;
    }

    requestAnimationFrame(updateBg);

    const observer = new ResizeObserver(updateBg);
    observer.observe(filterRef.current);
    window.addEventListener("resize", updateBg);
    window.addEventListener("scroll", updateBg, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBg);
      window.removeEventListener("scroll", updateBg, true);
    };
  }, [activeLayerId, updateBg, isDragging]);

  // Only use bgData if it was computed for the currently active layer.
  // This prevents stale positions from flashing when switching layers,
  // since effects (which recompute bgData) run after paint.
  const validBg = bgData && bgData.layerId === activeLayerId ? bgData : null;

  return { validBg, filterRef, wrapperRef };
}
