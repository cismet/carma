import type { SidebarFeature } from "../components/ui/BelisSidebar";

/**
 * Build a deduplication key for a sidebar feature based on its sourceLayer
 * and database primary key (properties.id), falling back to MVT tile id.
 */
export const buildFeatureKey = (f: SidebarFeature): string => {
  const sl = f.sourceLayer ?? "";
  const dbId = String(f.properties?.id ?? f.id ?? "");
  return `${sl}::${dbId}`;
};
