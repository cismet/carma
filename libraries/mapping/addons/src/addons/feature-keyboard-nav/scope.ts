import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";

import { isLayerGroup, type LayerStackEntry } from "@carma-mapping/layers";

import type { FeatureKeyboardNavConfig } from "./types";

/**
 * Scope resolution for the three deployment shapes.
 *
 * The addon is declared in three places and is scoped by where it is declared:
 * on a route it navigates every navigable layer, on a workflow's `tools` the
 * layers of the group that workflow creates, on a layer entry's `tools` that
 * one catalog layer. Nothing downstream branches on the shape — the shapes only
 * differ in what comes out of here.
 *
 * Which style layers belong to a catalog layer is read from the catalog
 * metadata the style composer stamps, never guessed from layer id spelling.
 */

export type NavShape = "global" | "group" | "layer";

export type NavScope = {
  shape: NavShape;
  /** style layer ids to query; `undefined` means every layer the style draws */
  styleLayerIds?: string[];
  /** catalog layer ids in scope; `undefined` means unrestricted */
  catalogLayerIds?: string[];
  /**
   * Only features drawn by a catalog layer are navigable.
   *
   * This is what "every *navigable* layer" means in the global shape: the
   * basemap is a vector source like any other, and without this the arrow keys
   * would step onto road segments and label anchors. A config that names its
   * own `layers` has already said what it wants and is not narrowed further.
   */
  requireCatalogLayer?: boolean;
};

/**
 * The catalog layer a style layer or feature belongs to. Primary source is the
 * `metadata["layer-id"]` stamp; the `"<catalogId>::<styleLayerId>"` namespacing
 * of imperative mode is the fallback for layers added outside the composer.
 */
const catalogIdOfStyleLayer = (layer: {
  id: string;
  metadata?: unknown;
}): string | undefined => {
  const metadata = layer.metadata as Record<string, unknown> | undefined;
  const stamped = metadata?.["layer-id"];
  if (typeof stamped === "string" && stamped) return stamped;
  return layer.id.includes("::") ? layer.id.split("::")[0] : undefined;
};

export const catalogLayerIdOfFeature = (
  feature: MapGeoJSONFeature
): string | undefined =>
  feature.layer ? catalogIdOfStyleLayer(feature.layer) : undefined;

/** The catalog layer ids a target covers: a group resolves to its members. */
export const catalogLayerIdsOfTarget = (target: LayerStackEntry): string[] =>
  isLayerGroup(target) ? target.layers.map((layer) => layer.id) : [target.id];

/**
 * Style layer ids matching the `layers` patterns of the global shape. Matched
 * against the style's own ids and, in imperative mode, against the
 * merged-mode keys the map exposes, so a config written once works in both.
 */
const styleLayersMatchingPatterns = (
  map: MaplibreMap,
  patterns: string[]
): string[] => {
  const regexes = patterns.map((pattern) => new RegExp(pattern));
  const ids = (map.getStyle()?.layers ?? [])
    .filter((layer) => regexes.some((regex) => regex.test(layer.id)))
    .map((layer) => layer.id);

  const layerIdMap = (map as unknown as Record<string, unknown>)
    .__carmaLayerIdMap as
    | { mergedToNamespaced: Map<string, string> }
    | undefined;
  if (layerIdMap?.mergedToNamespaced) {
    for (const [mergedKey, namespacedId] of layerIdMap.mergedToNamespaced) {
      if (
        regexes.some((regex) => regex.test(mergedKey)) &&
        !ids.includes(namespacedId)
      ) {
        ids.push(namespacedId);
      }
    }
  }

  return ids;
};

export const resolveNavScope = (
  map: MaplibreMap | null,
  target: LayerStackEntry | null,
  config: FeatureKeyboardNavConfig
): NavScope => {
  if (!map) {
    return {
      shape: target ? (isLayerGroup(target) ? "group" : "layer") : "global",
    };
  }

  if (target) {
    const catalogLayerIds = catalogLayerIdsOfTarget(target);
    const wanted = new Set(catalogLayerIds);
    const styleLayerIds = (map.getStyle()?.layers ?? [])
      .filter((layer) => {
        const catalogId = catalogIdOfStyleLayer(layer);
        return catalogId !== undefined && wanted.has(catalogId);
      })
      .map((layer) => layer.id);
    return {
      shape: isLayerGroup(target) ? "group" : "layer",
      styleLayerIds,
      catalogLayerIds,
    };
  }

  // global: the whole map, optionally narrowed by the config's own patterns
  const patterns = config.layers ?? [];
  if (patterns.length > 0) {
    return {
      shape: "global",
      styleLayerIds: styleLayersMatchingPatterns(map, patterns),
    };
  }
  return { shape: "global", requireCatalogLayer: true };
};

/** A stable string for effect dependencies; scopes are rebuilt per render. */
export const navScopeKey = (scope: NavScope): string =>
  [
    scope.shape,
    scope.styleLayerIds?.join(",") ?? "*",
    scope.catalogLayerIds?.join(",") ?? "*",
    scope.requireCatalogLayer ? "catalog" : "any",
  ].join("|");
