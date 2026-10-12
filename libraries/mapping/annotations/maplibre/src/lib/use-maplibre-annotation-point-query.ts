import { useEffect } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  useEnginePointQuery,
  type AnnotationEngine,
  type AnnotationPointQueryOptions,
} from "@carma-mapping/annotations/runtime";

export const useMapLibreAnnotationPointQuery = (
  map: MaplibreMap,
  engine: AnnotationEngine | null,
  options: AnnotationPointQueryOptions
) => {
  const enabled = (options.enabled ?? true) && engine !== null;
  useEffect(() => {
    if (!enabled) return;
    const restoreZoom = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    return () => {
      if (restoreZoom) map.doubleClickZoom.enable();
    };
  }, [enabled, map]);
  useEnginePointQuery(engine, options);
};
