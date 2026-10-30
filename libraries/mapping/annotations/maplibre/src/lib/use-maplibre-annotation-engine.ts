import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";

import {
  createMapLibreAnnotationEngine,
  type MapLibreAnnotationEngineOptions,
} from "./create-maplibre-annotation-engine";

type OwnedEngine = {
  engine: AnnotationEngine;
  map: MaplibreMap;
  options: MapLibreAnnotationEngineOptions | undefined;
};

/**
 * One engine per map instance and options object, created once the host has
 * mounted and disposed when either changes or the host unmounts; hosts keep
 * the options referentially stable. Created in an effect, so a remount builds
 * a fresh engine instead of reviving a disposed one.
 */
export const useMapLibreAnnotationEngine = (
  map: MaplibreMap | null,
  options?: MapLibreAnnotationEngineOptions
): AnnotationEngine | null => {
  const [owned, setOwned] = useState<OwnedEngine | null>(null);
  useEffect(() => {
    if (!map) return;
    const engine = createMapLibreAnnotationEngine(map, options);
    setOwned({ engine, map, options });
    return () => {
      engine.dispose();
      setOwned(null);
    };
  }, [map, options]);
  return owned && owned.map === map && owned.options === options
    ? owned.engine
    : null;
};
