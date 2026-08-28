import type { Map as MaplibreMap } from "maplibre-gl";

import {
  buildDimExpression,
  LASSO_LAYER_ID_PREFIX,
} from "@carma-mapping/engines/maplibre";

/**
 * The drawing tool's own preview layers, excluded whatever a route configures:
 * dimming them fades the very shape the user is pulling.
 */
const ALWAYS_EXCLUDED = [LASSO_LAYER_ID_PREFIX];

/** opacity paint properties per MapLibre layer type */
const OPACITY_PROPS: Record<string, string[]> = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
};

export interface DimController {
  setActive: (active: boolean) => void;
  destroy: () => void;
}

export const createDimController = (
  map: MaplibreMap,
  {
    dimOpacity,
    stateKey,
    excluded,
  }: { dimOpacity: number; stateKey: string; excluded: string[] }
): DimController => {
  const originals = new Map<string, unknown>();
  /** paint values this controller could not install; never retried */
  const skipped = new Set<string>();
  let active = false;

  const isExcluded = (layerId: string) => {
    const id = layerId.toLowerCase();
    return [...ALWAYS_EXCLUDED, ...excluded].some((pattern) =>
      id.includes(pattern)
    );
  };

  /** what counts as highlighted: this controller dims by feature-state */
  const predicate = ["boolean", ["feature-state", stateKey], false];

  const dimmed = (original: unknown): unknown | null =>
    buildDimExpression(original, predicate, dimOpacity);

  const apply = () => {
    for (const layer of map.getStyle()?.layers ?? []) {
      if (isExcluded(layer.id)) continue;
      const props = OPACITY_PROPS[layer.type];
      if (!props) continue;
      for (const prop of props) {
        const key = `${layer.id}::${prop}`;
        if (skipped.has(key)) continue;
        if (!originals.has(key)) {
          try {
            originals.set(key, map.getPaintProperty(layer.id, prop) ?? null);
          } catch {
            continue;
          }
        }
        const original = originals.get(key);
        const desired = active ? dimmed(original) : original;
        if (active && desired === null) {
          // no legal dim expression for this value: leave the layer undimmed
          skipped.add(key);
          continue;
        }
        try {
          // skip no-op writes; they would trigger styledata -> apply
          if (
            JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
            JSON.stringify(desired)
          ) {
            map.setPaintProperty(
              layer.id,
              prop,
              (desired ?? undefined) as never
            );
            // A rejected value is reported through the map's `error` event and
            // the property keeps its old one, so the guard above would never
            // settle. Stop after the first refusal instead of rewriting it on
            // every styledata.
            if (
              JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
              JSON.stringify(desired)
            ) {
              skipped.add(key);
            }
          }
        } catch {
          // layer removed between getStyle() and the write
        }
      }
    }
  };

  // a style rebuild drops the expression; reinstall it
  const onStyleData = () => {
    if (active) apply();
  };
  map.on("styledata", onStyleData);

  return {
    setActive: (next: boolean) => {
      if (next === active) return;
      active = next;
      apply();
    },
    destroy: () => {
      map.off("styledata", onStyleData);
      if (active) {
        active = false;
        apply();
      }
    },
  };
};
