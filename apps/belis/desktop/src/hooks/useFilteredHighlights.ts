/**
 * useFilteredHighlights - Mirror the map's layer-filter toggles onto the
 * highlight list.
 *
 * Two filter dimensions are honored, exactly like the map:
 *  1. The category toggles (Leuchten / Standorte / Leitungen / Schaltstellen /
 *     Abzweigdosen / Mauerlaschen) drive `activeSourceLayers` — a highlight is
 *     kept only when its `sourceLayer` is still active.
 *  2. The Leitungen toggle has a per-type sub-filter (Freileitung, Erdkabel, …)
 *     stored in `enabledLeitungstypen`. A "leitungen" highlight must additionally
 *     match an enabled Leitungstyp (compared by `properties.bezeichnung`, the
 *     same property the map filter uses). When every type is enabled, or none is
 *     explicitly set, the sub-filter is a no-op — matching `applyLeitungenFilter`.
 *
 * `isHighlightFiltered` is true only when the active filters actually drop at
 * least one highlight. When nothing is removed the original reference is returned
 * untouched, so downstream memos / effects don't churn on an identical array.
 */

import { useMemo } from "react";
import type { SidebarFeature } from "../components/ui/BelisSidebar";

export interface Leitungstyp {
  id: number;
  bezeichnung?: string;
}

export interface UseFilteredHighlightsResult {
  /** Highlights kept after applying the active layer + Leitungstyp filters.
   *  Falls back to the original reference when nothing is filtered out. */
  filteredHighlights: SidebarFeature[] | null;
  /** True only when the active filters removed at least one highlight. */
  isHighlightFiltered: boolean;
}

export function useFilteredHighlights(
  unfilteredHighlights: SidebarFeature[] | null,
  activeSourceLayers: Set<string>,
  enabledLeitungstypen: Record<number, boolean>,
  leitungstypen: Leitungstyp[]
): UseFilteredHighlightsResult {
  return useMemo(() => {
    // Nothing to filter when there are no highlights. (All toggles off is NOT a
    // bail-out — it must filter everything OUT, not show everything.)
    if (!unfilteredHighlights || unfilteredHighlights.length === 0) {
      return {
        filteredHighlights: unfilteredHighlights,
        isHighlightFiltered: false,
      };
    }

    // Leitungstyp sub-filter — mirror of `applyLeitungenFilter` on the map:
    // no filtering when every type is enabled or nothing has been set yet.
    // Otherwise build the set of allowed `bezeichnung` values; `null` means
    // "leitungen highlights pass through unrestricted".
    const allowedLeitungBezeichnungen = (() => {
      const noneExplicitlySet = Object.keys(enabledLeitungstypen).length === 0;
      const allEnabled = leitungstypen.every(
        (t) => enabledLeitungstypen[t.id] !== false
      );
      if (noneExplicitlySet || allEnabled) return null;
      const allowed = new Set<string>();
      for (const t of leitungstypen) {
        if (enabledLeitungstypen[t.id] !== false && t.bezeichnung) {
          allowed.add(t.bezeichnung);
        }
      }
      return allowed;
    })();

    const filtered = unfilteredHighlights.filter((h) => {
      const sl = h.sourceLayer || "";
      if (!activeSourceLayers.has(sl)) return false;
      // Leitungen additionally honor the per-Leitungstyp toggles.
      if (sl === "leitungen" && allowedLeitungBezeichnungen) {
        return allowedLeitungBezeichnungen.has(
          String(h.properties?.bezeichnung ?? "")
        );
      }
      return true;
    });

    const isHighlightFiltered = filtered.length < unfilteredHighlights.length;

    return {
      // Keep the original reference when the filter is a no-op so downstream
      // memos / effects don't churn on an identical-but-new array.
      filteredHighlights: isHighlightFiltered ? filtered : unfilteredHighlights,
      isHighlightFiltered,
    };
  }, [
    unfilteredHighlights,
    activeSourceLayers,
    enabledLeitungstypen,
    leitungstypen,
  ]);
}
