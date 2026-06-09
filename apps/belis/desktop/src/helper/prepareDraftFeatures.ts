import type { MapGeoJSONFeatureWithOriginal as SidebarFeature } from "@carma-mapping/utils";

/**
 * Pre-processes draft sidebar features for correct grouping in BelisSidebar.
 *
 * Normalizes each Leuchte's `fk_standort` from a nested object
 * (`{id, lfd_nummer, …}`) to a flat string ID so BelisSidebar's Standort/
 * Leuchten clustering pairs it with its parent.
 *
 * Indentation is decided by BelisSidebar from the rendered cluster (does the
 * Leuchte's parent Standort appear in the list?), not precomputed here — the
 * same prepared list feeds both the Entwürfe tab (only draft parents present)
 * and the Fachobjekte tab (parents come from the viewport), so a tab-blind
 * flag would mis-indent an edited Leuchte whose parent is a viewport Standort.
 */
export function prepareDraftFeatures(
  features: SidebarFeature[]
): SidebarFeature[] {
  return features.map((f) => {
    if (f.sourceLayer !== "leuchten") return f;

    // Normalize fk_standort: nested object → flat ID
    const raw = f.properties?.fk_standort;
    if (typeof raw !== "object" || raw == null) return f;

    const flatId = raw.id != null ? String(raw.id) : undefined;
    if (flatId == null) return f;

    return {
      ...f,
      properties: { ...f.properties, fk_standort: flatId },
    } as unknown as SidebarFeature;
  });
}
