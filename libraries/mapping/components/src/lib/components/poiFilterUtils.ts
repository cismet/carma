import type { AdvancedFilterState } from "./AdvancedFilterPanel";

/**
 * Given all unique kombi values and the current filter state, return
 * those kombi values whose features should be visible.
 */
export function getAllowedKombis(
  allKombis: string[],
  filterState: AdvancedFilterState
): string[] {
  return allKombis.filter((kombi) => {
    const ll = kombi.split(", ");
    for (const lebenslage of ll) {
      if (filterState.negativ.includes(lebenslage)) return false;
    }
    return ll.some((l) => filterState.positiv.includes(l));
  });
}

/**
 * Build a MapLibre filter expression that only shows features with allowed kombi values.
 */
export function buildPoiFilterExpression(
  allowedKombis: string[]
): any[] | null {
  if (allowedKombis.length === 0) {
    return ["==", ["get", "kombi"], "___HIDE_ALL___"];
  }
  return [
    "any",
    ["!", ["has", "kombi"]],
    ["==", ["get", "kombi"], ""],
    ["match", ["get", "kombi"], allowedKombis, true, false],
  ];
}

/**
 * Find all layer IDs in the map that use source-layer "poi" (excluding the selection layer).
 */
export function findPoiLayerIds(map: any): string[] {
  const style = map.getStyle();
  if (!style?.layers) return [];
  return style.layers
    .filter(
      (l: any) => l["source-layer"] === "poi" && l.id !== "poi-images-selection"
    )
    .map((l: any) => l.id);
}

/**
 * Serialize AdvancedFilterState to Record<string, boolean> for store persistence.
 * true = positiv, false = negativ, absent = neutral.
 */
export function serializeFilterState(
  state: AdvancedFilterState
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of state.positiv) result[key] = true;
  for (const key of state.negativ) result[key] = false;
  return result;
}

/**
 * Deserialize Record<string, boolean> back to AdvancedFilterState.
 */
export function deserializeFilterState(
  stored: Record<string, boolean>
): AdvancedFilterState {
  const positiv: string[] = [];
  const negativ: string[] = [];
  for (const [key, value] of Object.entries(stored)) {
    if (value === true) positiv.push(key);
    else if (value === false) negativ.push(key);
  }
  return { positiv, negativ };
}
