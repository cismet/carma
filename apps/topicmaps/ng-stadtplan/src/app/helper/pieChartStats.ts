import type { AdvancedFilterState } from "@carma-mapping/components";
import { getAllowedKombis } from "./filter";
import { getColorForCombination } from "./colors";

export interface PieChartResult {
  pieChartData: [string, number][];
  pieChartColors: string[];
}

export function computePieChartStats(
  allFeatures: any[],
  allKombis: string[],
  filterState: AdvancedFilterState
): PieChartResult {
  if (allFeatures.length === 0) {
    return { pieChartData: [], pieChartColors: [] };
  }

  const allowedKombis = new Set(getAllowedKombis(allKombis, filterState));
  const stats: Record<string, number> = {};
  const colors: Record<string, string> = {};

  for (const f of allFeatures) {
    const kombi = f.properties?.kombi;
    if (typeof kombi !== "string" || kombi.length === 0) continue;
    if (!allowedKombis.has(kombi)) continue;
    const key = kombi.split(", ").slice().sort().join(", ");
    stats[key] = (stats[key] || 0) + 1;
    if (!colors[key]) {
      colors[key] = getColorForCombination(key);
    }
  }

  const data: [string, number][] = Object.entries(stats);
  const colorArr = data.map(([key]) => colors[key]);
  return { pieChartData: data, pieChartColors: colorArr };
}
