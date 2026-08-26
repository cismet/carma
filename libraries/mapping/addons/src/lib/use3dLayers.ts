import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { has3dLayers } from "@carma-mapping/engines/maplibre";

/**
 * Whether the map draws anything three dimensional right now.
 *
 * Read on `styledata` and `idle`, the events around which 3D layers are
 * attached and taken off again; `idle` catches the attach that a `styledata`
 * handler was still too early to see. React drops equal writes, so the repeated
 * reads cost a set lookup.
 *
 * `enabled` exists so an addon that is configured not to care pays nothing and
 * registers no listeners.
 */
export const use3dLayers = (
  map: MaplibreMap | null,
  enabled: boolean
): boolean => {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    if (!enabled || !map) {
      setPresent(false);
      return;
    }
    const check = () => setPresent(has3dLayers(map));
    check();
    map.on("styledata", check);
    map.on("idle", check);
    return () => {
      map.off("styledata", check);
      map.off("idle", check);
    };
  }, [map, enabled]);

  return present;
};
