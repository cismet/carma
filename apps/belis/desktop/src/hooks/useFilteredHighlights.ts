/**
 * useFilteredHighlights - Mirror the map's layer-filter toggles onto the
 * highlight list.
 *
 * The Schaltstellen / Abzweigdosen / Mauerlaschen / Leuchten / Standorte /
 * Leitungen toggles drive `activeSourceLayers` (the set of source layers the
 * map currently shows). This hook produces a copy of `unfilteredHighlights` that
 * keeps only the highlights whose `sourceLayer` is still active, so the
 * Highlights sidebar list stays in sync with what is visible on the map.
 *
 * `isHighlightFiltered` is true ONLY when the active filters actually drop at
 * least one highlight. When nothing is removed (all relevant toggles on, no
 * highlights, or no filter active) it stays false and `filteredHighlights`
 * returns the original reference untouched — so callers can cheaply fall back
 * to the normal `unfilteredHighlights`.
 */

import { useMemo } from "react";
import type { SidebarFeature } from "../components/ui/BelisSidebar";
import { BELIS_FILTER_CATEGORIES } from "../config/mapLayerConfigs";

export interface UseFilteredHighlightsResult {
  /** Highlights kept after applying the active layer filters. Falls back to the
   *  original `unfilteredHighlights` reference when nothing is filtered out. */
  filteredHighlights: SidebarFeature[] | null;
  /** True when at least one category toggle is switched off. */
  isHighlightFiltered: boolean;
}

export function useFilteredHighlights(
  unfilteredHighlights: SidebarFeature[] | null,
  activeSourceLayers: Set<string>
): UseFilteredHighlightsResult {
  return useMemo(() => {
    // Nothing to filter: no highlights, or no filter category active at all.
    if (!unfilteredHighlights || unfilteredHighlights.length === 0) {
      return {
        filteredHighlights: unfilteredHighlights,
        isHighlightFiltered: false,
      };
    }

    const filtered = unfilteredHighlights.filter((h) =>
      activeSourceLayers.has(h.sourceLayer || "")
    );

    // Filtered whenever at least one category toggle is switched off.
    const isHighlightFiltered =
      activeSourceLayers.size <= BELIS_FILTER_CATEGORIES.length;

    return {
      // Keep the original reference when the filter is a no-op so downstream
      // memos / effects don't churn on an identical-but-new array.
      filteredHighlights: isHighlightFiltered ? filtered : unfilteredHighlights,
      isHighlightFiltered,
    };
  }, [unfilteredHighlights, activeSourceLayers]);
}
