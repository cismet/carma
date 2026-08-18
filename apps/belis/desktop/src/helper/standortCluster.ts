import type {
  GeoJSONFeature,
  Map as MaplibreMap,
  MapGeoJSONFeature,
} from "maplibre-gl";
import type { SidebarFeature } from "../components/ui/BelisSidebar";

/**
 * Standort/Leuchten cluster lookups against the live map sources.
 *
 * `map.querySourceFeatures` returns features WITHOUT `source` / `sourceLayer`
 * (unlike `queryRenderedFeatures`), so every consumer that keys on those fields
 * — the sidebar's group + Standort/Leuchten clustering, `useFilteredHighlights`,
 * `buildFeatureKey` — must be handed features that carry them. `toSidebarFeature`
 * stamps both; use it for anything that came out of a source query.
 *
 * Brandnew (same-day) creations live in a separate GeoJSON source, so a cluster
 * can straddle two sources: a tile Standort with a brandnew Leuchte, or the
 * reverse. Always query the ids from `clusterSourceIds`, never just the clicked
 * feature's own source.
 *
 * When a feature exists in BOTH sources, the brandnew copy is the one that
 * matters — see `clusterSourceIds` for why. Every lookup here dedupes by DB pk
 * in `sourceIds` order, so that order decides which copy a cluster carries.
 */

/**
 * Stamp `source` / `sourceLayer` on a feature, keeping any it already has.
 *
 * `geometry` is a lazy accessor on maplibre's GeoJSONFeature prototype, so a
 * plain spread would drop it (only own properties are copied) and leave the row
 * without coordinates to zoom to or export. Read it once to materialize it.
 */
export const toSidebarFeature = (
  f: MapGeoJSONFeature | GeoJSONFeature,
  source?: string,
  sourceLayer?: string
): SidebarFeature => {
  const feat = f as unknown as Record<string, unknown>;
  return {
    ...f,
    geometry: f.geometry,
    original: f,
    source: (feat.source as string | undefined) ?? source,
    sourceLayer: (feat.sourceLayer as string | undefined) ?? sourceLayer,
  } as unknown as SidebarFeature;
};

/**
 * Every source a cluster member may live in, BRANDNEW FIRST.
 *
 * The order is the dedup preference: a feature present in both sources is taken
 * from whichever source comes first. That must be the brandnew one, because a
 * feature only reaches the brandnew FC by being created or edited today — and
 * whenever that happens its vector-tile copy is *hidden* on the map
 * (`hiddenOriginalIds`: a brandnew Standort by id, the parent Standort of a
 * brandnew Leuchte by id, and — via the leuchten cascade — every tile Leuchte
 * under such a Standort). `querySourceFeatures` reads the tile cache and ignores
 * layer filters, so the hidden copy is still returned here.
 *
 * Preferring it produced a cluster of invisible members: highlight feature-state
 * was written onto tile features that draw nothing, so a lassoed brandnew
 * Fachobjekt filled the Highlights tab but left the map fully dimmed and the
 * Fachobjekte tab (which counts *rendered* highlighted features) at 0. It only
 * looked right with the "regular" dev toggle off, where no tiles load at all.
 */
export const clusterSourceIds = (
  namespacedSource: string,
  brandnewSource?: string
): string[] =>
  brandnewSource && brandnewSource !== namespacedSource
    ? [brandnewSource, namespacedSource]
    : [namespacedSource];

/**
 * Query one source layer across a source. The `sourceLayer` param already
 * restricts vector tiles; GeoJSON tiles ignore it (everything lands in
 * `_geojsonTileLayer`), so those are narrowed by the `_sourceLayer` property
 * the brandnew FC stamps on each feature.
 */
const queryLayer = (
  map: MaplibreMap,
  source: string,
  sourceLayer: string
): GeoJSONFeature[] => {
  const features = map.querySourceFeatures(source, { sourceLayer });
  if (map.getSource(source)?.type !== "geojson") return features;
  return features.filter(
    (f) => String(f.properties?._sourceLayer ?? "") === sourceLayer
  );
};

/** All Leuchten of a Standort, deduplicated across sources, by Leuchtennummer. */
export const queryLeuchtenByStandort = (
  map: MaplibreMap,
  standortDbId: string,
  sourceIds: string[]
): SidebarFeature[] => {
  if (!standortDbId) return [];
  const seen = new Map<string, SidebarFeature>();
  for (const source of sourceIds) {
    for (const l of queryLayer(map, source, "leuchten")) {
      if (String(l.properties?.fk_standort ?? "") !== standortDbId) continue;
      const lid = String(l.properties?.id ?? l.id ?? "");
      if (!seen.has(lid)) seen.set(lid, toSidebarFeature(l, source, "leuchten"));
    }
  }
  return [...seen.values()].sort(
    (a, b) =>
      (Number(a.properties?.leuchtennummer) || 0) -
      (Number(b.properties?.leuchtennummer) || 0)
  );
};

/** The parent Standort of a Leuchte, or null when it is out of the loaded tiles. */
export const queryStandortById = (
  map: MaplibreMap,
  standortDbId: string,
  sourceIds: string[]
): SidebarFeature | null => {
  if (!standortDbId) return null;
  for (const source of sourceIds) {
    const match = queryLayer(map, source, "standorte").find(
      (s) => String(s.properties?.id ?? "") === standortDbId
    );
    if (match) return toSidebarFeature(match, source, "standorte");
  }
  return null;
};

export interface ClusterIndex {
  standorteById: Map<string, SidebarFeature>;
  leuchtenByStandort: Map<string, SidebarFeature[]>;
}

/**
 * Index every loaded Standort and Leuchte in one pass.
 *
 * Use this instead of per-feature `queryStandortById` / `queryLeuchtenByStandort`
 * when expanding many features at once (lasso): each of those scans the whole
 * source, so calling them per hit is O(hits × source size).
 */
export const buildClusterIndex = (
  map: MaplibreMap,
  sourceIds: string[]
): ClusterIndex => {
  const standorteById = new Map<string, SidebarFeature>();
  const leuchtenByStandort = new Map<string, SidebarFeature[]>();
  const seenLeuchten = new Set<string>();

  for (const source of sourceIds) {
    for (const s of queryLayer(map, source, "standorte")) {
      const id = String(s.properties?.id ?? "");
      if (id && !standorteById.has(id)) {
        standorteById.set(id, toSidebarFeature(s, source, "standorte"));
      }
    }
    for (const l of queryLayer(map, source, "leuchten")) {
      const fk = String(l.properties?.fk_standort ?? "");
      const lid = String(l.properties?.id ?? l.id ?? "");
      if (!fk || !lid || seenLeuchten.has(lid)) continue;
      seenLeuchten.add(lid);
      const list = leuchtenByStandort.get(fk) ?? [];
      list.push(toSidebarFeature(l, source, "leuchten"));
      leuchtenByStandort.set(fk, list);
    }
  }

  for (const list of leuchtenByStandort.values()) {
    list.sort(
      (a, b) =>
        (Number(a.properties?.leuchtennummer) || 0) -
        (Number(b.properties?.leuchtennummer) || 0)
    );
  }
  return { standorteById, leuchtenByStandort };
};

/** The Standort DB id a feature clusters under, or null when it stands alone. */
export const clusterIdOf = (f: SidebarFeature): string | null => {
  const sl = f.sourceLayer ?? "";
  if (sl === "standorte") return String(f.properties?.id ?? f.id ?? "") || null;
  if (sl === "leuchten") return String(f.properties?.fk_standort ?? "") || null;
  return null;
};

/** A cluster's rows, Standort first, then its Leuchten by Leuchtennummer. */
export const clusterMembers = (
  standortDbId: string,
  index: ClusterIndex
): SidebarFeature[] => {
  const standort = index.standorteById.get(standortDbId);
  const leuchten = index.leuchtenByStandort.get(standortDbId) ?? [];
  return standort ? [standort, ...leuchten] : leuchten;
};
