import type { MapGeoJSONFeatureWithOriginal as SidebarFeature } from "@carma-mapping/utils";

/**
 * Pre-processes draft sidebar features for correct grouping in BelisSidebar.
 *
 * 1. Normalizes `fk_standort` from nested object (`{id, lfd_nummer, …}`)
 *    to a flat string ID so BelisSidebar's clustering works correctly.
 *
 * 2. Marks orphan leuchten (whose parent standort is not in the drafts)
 *    with `_noIndent: true` so BelisSidebar can skip indentation for them.
 */
export function prepareDraftFeatures(
  features: SidebarFeature[],
): SidebarFeature[] {
  // Collect all standort IDs present in the draft list
  const standortIds = new Set<string>();
  for (const f of features) {
    if (f.sourceLayer === "standorte") {
      const id = String(f.properties?.id ?? f.id ?? "");
      if (id) standortIds.add(id);
    }
  }

  return features.map((f) => {
    if (f.sourceLayer !== "leuchten") return f;

    // Normalize fk_standort: nested object → flat ID
    const raw = f.properties?.fk_standort;
    const flatId =
      typeof raw === "object" && raw != null && raw.id != null
        ? String(raw.id)
        : raw != null
          ? String(raw)
          : undefined;

    const isPaired = flatId != null && standortIds.has(flatId);

    const needsNormalize = typeof raw === "object" && raw != null;
    const needsNoIndent = !isPaired;

    if (!needsNormalize && !needsNoIndent) return f;

    return {
      ...f,
      properties: {
        ...f.properties,
        ...(needsNormalize && flatId != null ? { fk_standort: flatId } : {}),
        ...(needsNoIndent ? { _noIndent: true } : {}),
      },
    } as unknown as SidebarFeature;
  });
}
