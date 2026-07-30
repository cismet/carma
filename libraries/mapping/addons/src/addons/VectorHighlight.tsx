import { useEffect, useMemo, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useMapHighlight } from "@carma-mapping/contexts";
import {
  useMapHighlighting,
  useLassoHighlight,
} from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../lib/registry";

/**
 * Highlight/dim addon for the MapLibre map (`featureFlagLibreMap`, alias `ng`).
 *
 * Modifier+click a feature -> it stays at its normal paint, everything else is
 * dimmed; clicking it again removes it. With `lasso: true`, an alt+drag does
 * the same for every feature it covers. Removing the last highlight does *not*
 * turn the mode off — the map stays dimmed until the route unmounts, which is
 * where the untouched paint is restored. `useMapHighlighting` owns the
 * `highlighted` feature-state (including re-applying it to features from newly
 * loaded tiles), `useLassoHighlight` owns the drawing; this addon only adds the
 * dim half and the lifecycle.
 *
 * WHY THE PAINT WRAPPING: BELIS ships the dim expression in its own style
 * config and gates it with `["global-state", "highlightingEnabled"]`. Styles
 * that come from the layer catalog at runtime have no such branch, so we gate
 * by *installing* the expression while the mode is on:
 *
 *   off -> the layer's original paint properties (untouched)
 *   on  -> ["case", ["boolean", ["feature-state","highlighted"], false],
 *            <original>,   // highlighted -> normal
 *            dimOpacity]   // everything else -> dimmed
 *
 * Originals are captured on first sight per "<layerId>::<prop>", so toggling
 * off restores the true original and toggling on never wraps a wrapper. Set
 * `dimOpacity: null` for styles that already dim via `global-state`, otherwise
 * both would apply.
 */

export type VectorHighlightConfig = {
  /** Modifier for click-to-toggle; `null` disables it. Default: "alt" */
  modifierClick?: "alt" | "ctrl" | "shift" | "meta" | null;
  /** Opacity of non-highlighted features; `null` leaves paint alone. Default: 0.25 */
  dimOpacity?: number | null;
  /** Feature-state key, must match the style if it dims itself. Default: "highlighted" */
  stateKey?: string;
  /** Layer ids containing one of these (lowercased) are never dimmed. */
  excludedLayerPatterns?: string[];
  /**
   * Alt+drag draws a freehand lasso; every feature it covers is toggled the
   * same way a modifier+click would toggle it. Default: false.
   */
  lasso?: boolean;
};

const DEFAULT_DIM_OPACITY = 0.25;
const DEFAULT_STATE_KEY = "highlighted";
// cismap's selection border and the basemap must keep their paint.
const DEFAULT_EXCLUDED = ["selection", "background"];

// Opacity paint props per MapLibre layer type.
const OPACITY_PROPS: Record<string, string[]> = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
};

interface DimController {
  setActive: (active: boolean) => void;
  destroy: () => void;
}

const createDimController = (
  map: MaplibreMap,
  {
    dimOpacity,
    stateKey,
    excluded,
  }: { dimOpacity: number; stateKey: string; excluded: string[] }
): DimController => {
  const originals = new Map<string, unknown>();
  let active = false;

  const isExcluded = (layerId: string) => {
    const id = layerId.toLowerCase();
    return excluded.some((pattern) => id.includes(pattern));
  };

  const dimBranch = (original: unknown) => [
    "case",
    ["boolean", ["feature-state", stateKey], false],
    original == null ? 1 : original,
    dimOpacity,
  ];

  const apply = () => {
    for (const layer of map.getStyle()?.layers ?? []) {
      if (isExcluded(layer.id)) continue;
      const props = OPACITY_PROPS[layer.type];
      if (!props) continue;
      for (const prop of props) {
        const key = `${layer.id}::${prop}`;
        if (!originals.has(key)) {
          try {
            originals.set(key, map.getPaintProperty(layer.id, prop) ?? null);
          } catch {
            continue;
          }
        }
        const original = originals.get(key);
        const desired = active ? dimBranch(original) : original;
        try {
          // Skip if already applied — avoids a setPaintProperty -> styledata
          // -> apply feedback loop.
          if (
            JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
            JSON.stringify(desired)
          ) {
            map.setPaintProperty(
              layer.id,
              prop,
              (desired ?? undefined) as never
            );
          }
        } catch {
          // layer went away between getStyle() and the write
        }
      }
    }
  };

  // Style rebuilds (a layer added/removed) drop our expression — reinstall.
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

export const VectorHighlight = ({
  config,
  libreMap,
}: AddonComponentProps<"vectorHighlight">) => {
  const {
    modifierClick = "alt",
    dimOpacity = DEFAULT_DIM_OPACITY,
    stateKey = DEFAULT_STATE_KEY,
    excludedLayerPatterns,
    lasso = false,
  } = config;

  const { highlightingActive, setHighlightingActive, clearHighlights } =
    useMapHighlight();

  // owns the `highlighted` feature-state and the click-to-toggle
  useMapHighlighting({ map: libreMap, modifierClick, stateKey });

  // route configs pass a fresh array on every render; key the effect on the
  // content instead of the identity
  const excludedKey = (excludedLayerPatterns ?? DEFAULT_EXCLUDED)
    .map((pattern) => pattern.toLowerCase())
    .join(" ");
  const excluded = useMemo(
    () => (excludedKey ? excludedKey.split(" ") : []),
    [excludedKey]
  );

  // Alt+drag lasso: `active: false` leaves the hook's explicit (toolbar-driven)
  // manager off, which is exactly what puts its passive Alt+drag manager in
  // charge — no UI needed. It toggles what it covers and switches highlighting
  // on if it was off, matching the modifier+click semantics above; a stationary
  // Alt+click never becomes a lasso (minPoints guard) and a real Alt+drag never
  // becomes a click (MapLibre drops clicks past its clickTolerance), so the two
  // coexist on the same modifier. Hooks can't be called conditionally, so the
  // feature is gated by handing over a null map.
  //
  // No `sources` filter: same as the click path above, every source the style
  // exposes is fair game. Raster basemaps yield no features at all and the
  // geojson overlays carry no feature ids (no `generateId`), so both are
  // skipped anyway.
  useLassoHighlight({ map: lasso ? libreMap : null, active: false });

  const controllerRef = useRef<DimController | null>(null);
  // read inside the create effect, so a controller built after the mode was
  // already switched on installs the expression right away
  const activeRef = useRef(highlightingActive);
  activeRef.current = highlightingActive;

  useEffect(() => {
    if (!libreMap || dimOpacity == null) {
      return;
    }
    const controller = createDimController(libreMap, {
      dimOpacity,
      stateKey,
      excluded,
    });
    controllerRef.current = controller;
    controller.setActive(activeRef.current);
    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, [libreMap, dimOpacity, stateKey, excluded]);

  useEffect(() => {
    controllerRef.current?.setActive(highlightingActive);
  }, [highlightingActive]);

  // Route switch unmounts the addon: leave the map in its untouched state.
  useEffect(
    () => () => {
      clearHighlights();
      setHighlightingActive(false);
    },
    [clearHighlights, setHighlightingActive]
  );

  return null;
};
