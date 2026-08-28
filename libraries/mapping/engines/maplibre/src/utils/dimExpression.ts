/**
 * Building a "dimmed unless it matches" opacity value.
 *
 * Two callers with the same problem: the highlight addon dims by feature-state
 * at runtime, the style builder bakes an attribute predicate into the composed
 * style. Both need the same care around zoom, so the expression lives here once.
 */

import type { FilterPresentation } from "@carma-mapping/contexts";

/**
 * Does this layer show its user filter as a dim rather than as a filter?
 *
 * The policy is map-wide and lives on `LibreContext`, so a host app never has
 * to know about it: it keeps putting a plain `userFilter` on its layers and the
 * style builder decides what that filter does.
 */
export const presentsFilterAsDim = (
  presentation: FilterPresentation,
  layerId: string
): boolean =>
  !!presentation &&
  (presentation.layerIds === null || presentation.layerIds.includes(layerId));

/** does this paint value read the zoom anywhere? */
const readsZoom = (value: unknown): boolean =>
  Array.isArray(value) && (value[0] === "zoom" || value.some(readsZoom));

/**
 * `<value>` where the predicate holds, `<value> * dimOpacity` where it does not.
 * The value is scaled rather than replaced, so an opacity the style had already
 * faded out stays faded out instead of reappearing at `dimOpacity`.
 */
const dimBranch = (
  original: unknown,
  predicate: unknown,
  dimOpacity: number
): unknown => {
  const value = original == null ? 1 : original;
  return [
    "case",
    predicate,
    value,
    typeof value === "number" ? value * dimOpacity : ["*", value, dimOpacity],
  ];
};

/**
 * The dim expression for one opacity value, or `null` when it cannot be built.
 * A `null` result means "leave this one alone"; it is never a reason to fail.
 *
 * A zoom-driven original must not be wrapped: MapLibre accepts `["zoom"]` only
 * as the direct input of a top-level `step` / `interpolate`, so a `case` around
 * it fails validation ("zoom expression may only be used as input to a top-level
 * step or interpolate expression"). The write is then refused and the property
 * keeps its old value. B-Plan's `text-opacity` fades in by zoom and hit exactly
 * that.
 *
 * The curve therefore stays on top and the branch moves into its outputs, which
 * is equivalent and legal. Zoom in any other position is left alone rather than
 * guessed at.
 */
export const buildDimExpression = (
  original: unknown,
  predicate: unknown,
  dimOpacity: number
): unknown | null => {
  if (!readsZoom(original)) {
    return dimBranch(original, predicate, dimOpacity);
  }

  const expr = original as unknown[];
  const inputOf = (index: number) =>
    Array.isArray(expr[index]) && (expr[index] as unknown[])[0] === "zoom";

  // ["interpolate", <type>, ["zoom"], stop, output, ...]
  if (
    expr[0] === "interpolate" ||
    expr[0] === "interpolate-hcl" ||
    expr[0] === "interpolate-lab"
  ) {
    if (!inputOf(2)) {
      return null;
    }
    const out = expr.slice(0, 3);
    for (let i = 3; i < expr.length; i += 2) {
      out.push(expr[i], dimBranch(expr[i + 1], predicate, dimOpacity));
    }
    return out;
  }

  // ["step", ["zoom"], <default>, stop, output, ...]
  if (expr[0] === "step") {
    if (!inputOf(1)) {
      return null;
    }
    const out: unknown[] = [
      expr[0],
      expr[1],
      dimBranch(expr[2], predicate, dimOpacity),
    ];
    for (let i = 3; i < expr.length; i += 2) {
      out.push(expr[i], dimBranch(expr[i + 1], predicate, dimOpacity));
    }
    return out;
  }

  return null;
};
