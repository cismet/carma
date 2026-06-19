import { ENDPOINT } from "../constants/belis";
import { EXPORT_QUERY_BY_LAYER } from "../constants/searchFields";
import { flattenGqlRecord } from "./flattenGqlRecord";
import type { ExportableFeature } from "../utils/csvExport";

const dbId = (f: ExportableFeature): string | number | undefined =>
  f.properties?.id as string | number | undefined;

// Enrich highlighted features for export. Highlighted features that come from
// the map (lasso/click) only carry vector-tile properties — a small fixed
// subset. To export the full attribute set we re-fetch each record by id via
// GraphQL (reusing the search field selections) and flatten the result the
// same way search results are flattened.
//
// Features whose sourceLayer has no enrichment query (e.g. leitungen,
// abzweigdosen), or whose fetch fails, fall back to their existing properties
// so they still appear in the export.
export const fetchFeaturesForExport = async (
  features: ExportableFeature[],
  jwt: string
): Promise<ExportableFeature[]> => {
  // Group feature ids by sourceLayer (only layers we can enrich).
  const idsByLayer = new Map<string, Set<string | number>>();
  for (const f of features) {
    const layer = f.sourceLayer;
    if (!layer || !EXPORT_QUERY_BY_LAYER[layer]) continue;
    const id = dbId(f);
    if (id === undefined || id === null) continue;
    if (!idsByLayer.has(layer)) idsByLayer.set(layer, new Set());
    idsByLayer.get(layer)!.add(id);
  }

  // Fetch all enrichable layers in parallel; build a layer -> (id -> flat props) lookup.
  const enriched = new Map<string, Map<string, Record<string, unknown>>>();
  await Promise.all(
    [...idsByLayer.entries()].map(async ([layer, ids]) => {
      const { table, fields } = EXPORT_QUERY_BY_LAYER[layer];
      const idList = [...ids].map((id) => Number(id)).filter((n) => !isNaN(n));
      if (idList.length === 0) return;
      const query = `query ExportEnrich {
  ${table}(where: { id: { _in: [${idList.join(",")}] } }) {
    ${fields}
  }
}`;
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ query }),
        });
        const json = await res.json();
        const records: Record<string, unknown>[] = json.data?.[table] ?? [];
        const byId = new Map<string, Record<string, unknown>>();
        for (const rec of records) {
          byId.set(String(rec.id), flattenGqlRecord(rec, layer));
        }
        enriched.set(layer, byId);
      } catch (e) {
        console.error(`Export enrichment failed for ${layer}:`, e);
      }
    })
  );

  // Replace each feature's properties with the enriched record when available.
  return features.map((f) => {
    const layer = f.sourceLayer;
    const id = dbId(f);
    const flat =
      layer && id != null ? enriched.get(layer)?.get(String(id)) : undefined;
    return flat ? { ...f, properties: flat } : f;
  });
};
