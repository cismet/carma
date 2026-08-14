import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { LayerStackEntry } from "@carma-mapping/layers";

import { navScopeKey, resolveNavScope, type NavScope } from "./scope";

/**
 * The active scope, kept in step with the style.
 *
 * Which style layers belong to a catalog layer can only be read off the style,
 * and the style is not finished when the addon mounts: layers arrive, a route
 * switch rebuilds them, a workflow adds a group. Resolving once would leave a
 * tool shape navigating an empty set for exactly as long as its layers took to
 * load.
 *
 * `styledata` fires many times while tiles settle, so the resolved scope is
 * compared by its key and the state is only replaced when it really changed;
 * an unchanged scope returns the previous object and React bails out.
 */
export const useNavScope = (
  map: MaplibreMap | null,
  target: LayerStackEntry | null,
  layerPatterns: string[]
): NavScope => {
  const patternKey = layerPatterns.join("|");
  const [scope, setScope] = useState<NavScope>(() =>
    resolveNavScope(map, target, { layers: layerPatterns })
  );

  useEffect(() => {
    const patterns = patternKey ? patternKey.split("|") : [];
    const update = () => {
      const next = resolveNavScope(map, target, { layers: patterns });
      setScope((previous) =>
        navScopeKey(previous) === navScopeKey(next) ? previous : next
      );
    };
    update();
    if (!map) return;
    map.on("styledata", update);
    return () => {
      map.off("styledata", update);
    };
  }, [map, target, patternKey]);

  return scope;
};
