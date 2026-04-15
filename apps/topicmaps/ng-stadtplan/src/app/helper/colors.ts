import { POI_COLORS } from "./constants";

/** Deterministic fallback color for combinations not in POI_COLORS */
function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 30%, 50%)`;
}

export function getColorForCombination(combination: string): string {
  return POI_COLORS[combination] || hashColor(combination);
}
