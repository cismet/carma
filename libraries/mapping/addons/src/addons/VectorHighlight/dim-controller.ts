import type { Map as MaplibreMap } from "maplibre-gl";

import { LASSO_LAYER_ID_PREFIX } from "@carma-mapping/engines/maplibre";

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

  /** does this paint value read the zoom anywhere? */
  const readsZoom = (value: unknown): boolean =>
    Array.isArray(value) && (value[0] === "zoom" || value.some(readsZoom));

  /** `<original>` while highlighted, `<original> * dimOpacity` otherwise. The
   *  original is scaled rather than replaced, so a value the style had already
   *  faded out stays faded out instead of reappearing at `dimOpacity`. */
  const dimBranch = (original: unknown) => {
    const value = original == null ? 1 : original;
    return [
      "case",
      ["boolean", ["feature-state", stateKey], false],
      value,
      typeof value === "number" ? value * dimOpacity : ["*", value, dimOpacity],
    ];
  };

  /**
   * The dim expression for one paint value, or `null` when it cannot be built.
   *
   * A zoom-driven original must not be wrapped: MapLibre accepts `["zoom"]`
   * only as the direct input of a top-level `step` / `interpolate`, so a `case`
   * around it fails validation ("zoom expression may only be used as input to a
   * top-level step or interpolate expression"). The write is then refused, the
   * property keeps its old value, the no-op guard in `apply` never settles and
   * the whole thing is rewritten on every `styledata` — an error per layer per
   * event. B-Plan's `text-opacity` fades in by zoom and hit exactly that.
   *
   * The curve therefore stays on top and the branch moves into its outputs,
   * which is equivalent and legal. Zoom in any other position is left alone
   * rather than guessed at.
   */
  const dimmed = (original: unknown): unknown => {
    if (!readsZoom(original)) return dimBranch(original);

    const expr = original as unknown[];
    const inputOf = (index: number) =>
      Array.isArray(expr[index]) && (expr[index] as unknown[])[0] === "zoom";

    // ["interpolate", <type>, ["zoom"], stop, output, ...]
    if (
      expr[0] === "interpolate" ||
      expr[0] === "interpolate-hcl" ||
      expr[0] === "interpolate-lab"
    ) {
      if (!inputOf(2)) return null;
      const out = expr.slice(0, 3);
      for (let i = 3; i < expr.length; i += 2) {
        out.push(expr[i], dimBranch(expr[i + 1]));
      }
      return out;
    }

    // ["step", ["zoom"], <default>, stop, output, ...]
    if (expr[0] === "step") {
      if (!inputOf(1)) return null;
      const out: unknown[] = [expr[0], expr[1], dimBranch(expr[2])];
      for (let i = 3; i < expr.length; i += 2) {
        out.push(expr[i], dimBranch(expr[i + 1]));
      }
      return out;
    }

    return null;
  };

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
