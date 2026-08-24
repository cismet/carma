import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * The visible map size `useVisibleMapFeatures` compares against the canvas.
 * Geoportal does not oversize its canvas, so the canvas is the visible area and
 * its integer client size is reported as is: the fractional numbers of
 * `getBoundingClientRect()` would flip the hook's `isOversized` branch and shift
 * the query rectangle.
 */
export const useMapCanvasSize = (map: MaplibreMap | null) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!map) return;
    const measure = () => {
      const canvas = map.getCanvas();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      );
    };
    measure();
    // the canvas resizes as a consequence of the container resizing
    const observer = new ResizeObserver(measure);
    observer.observe(map.getContainer());
    map.on("resize", measure);
    return () => {
      observer.disconnect();
      map.off("resize", measure);
    };
  }, [map]);

  return size;
};
