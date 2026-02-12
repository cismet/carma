/**
 * useImperativeStyle: React hook wrapping StyleComposer for lifecycle management.
 *
 * Handles:
 * - Creating/destroying the StyleComposer when the map instance is available
 * - Diffing the layers prop to add/remove sub-styles incrementally
 * - Re-applying all layers when the background style changes
 * - Providing geoJsonMetadata for cluster marker rendering
 */

import { useCallback, useEffect, useRef } from "react";
import type { Map as MaplibreMap, StyleSpecification } from "maplibre-gl";
import {
  StyleComposer,
  slugifyUrl,
  type GeoJsonSubStyleMeta,
} from "../utils/styleComposer";
import type { LibreLayer } from "../components/LibreMap";
import { getVectorMapping } from "../utils/styleBuilder";

export interface UseImperativeStyleOptions {
  /** When false the hook is inert (merged mode is active). */
  enabled: boolean;
  map: MaplibreMap | null;
  layers?: LibreLayer[];
  backgroundStyle: StyleSpecification | null;
  vectorBackgroundLayers: LibreLayer[];
  clusteringEnabled: boolean;
  markerSymbolSize: number;
  overrideGlyphs?: string;
  filterFunction?: (map: MaplibreMap, layers?: LibreLayer[]) => void;
  /** Enable debug logging */
  debugLog?: boolean;
  /** Callbacks for feeding results back into LibreMap state */
  onMappingUpdate: (mapping: Record<string, string[] | string>) => void;
  onGeoJsonMetadataUpdate: (meta: Array<{ sourceId: string; uniqueColors: string[] }>) => void;
  onStyleReady: (style: StyleSpecification) => void;
  onHidingManagerRefresh: () => void;
}

/** Compute a stable key for a LibreLayer entry for diff purposes. */
function layerKey(layer: LibreLayer, index: number): string {
  switch (layer.type) {
    case "vector":
      return `vector::${layer.name}::${layer.style}`;
    case "geojson":
      return `geojson::${layer.name}::${layer.data}`;
    case "wms":
    case "wmts":
      return `${layer.type}::${layer.url}::${layer.layers}`;
    case "cog":
      return `cog::${layer.name}::${layer.url}`;
    default:
      return `unknown::${index}`;
  }
}

/** Derive a human-readable sub-style ID from a layer. */
function subStyleId(layer: LibreLayer, index: number): string {
  switch (layer.type) {
    case "vector": {
      if (layer.layer) {
        const atIdx = layer.layer.indexOf("@");
        if (atIdx > 0) return layer.layer.substring(0, atIdx);
      }
      return layer.name;
    }
    case "geojson":
      return `geojson-${layer.name}-${index}`;
    case "wms":
    case "wmts":
      return `raster-${layer.layers.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`;
    case "cog":
      return `cog-${layer.name}-${index}`;
    default:
      return `layer-${index}`;
  }
}

export function useImperativeStyle({
  enabled,
  map,
  layers,
  backgroundStyle,
  vectorBackgroundLayers,
  clusteringEnabled,
  markerSymbolSize,
  overrideGlyphs,
  filterFunction,
  onMappingUpdate,
  onGeoJsonMetadataUpdate,
  onStyleReady,
  onHidingManagerRefresh,
  debugLog = false,
}: UseImperativeStyleOptions): void {
  const composerRef = useRef<StyleComposer | null>(null);
  const prevKeysRef = useRef<string[]>([]);
  const prevIdsRef = useRef<string[]>([]);
  const isApplyingRef = useRef(false);

  // Stable callback: add all effective layers to the composer
  const applyAllLayers = useCallback(
    async (composer: StyleComposer, mapInst: MaplibreMap) => {
      if (isApplyingRef.current) return;
      isApplyingRef.current = true;
      if (debugLog) console.log("[LAYER_MODE] imperative: applyAllLayers, count:", [...vectorBackgroundLayers, ...(layers || [])].length);

      try {
        const effectiveLayers = [
          ...vectorBackgroundLayers,
          ...(layers || []),
        ];

        const newKeys: string[] = [];
        const newIds: string[] = [];
        const geoMeta: GeoJsonSubStyleMeta[] = [];

        for (let i = 0; i < effectiveLayers.length; i++) {
          const layer = effectiveLayers[i];
          const id = subStyleId(layer, i);
          const key = layerKey(layer, i);
          newKeys.push(key);
          newIds.push(id);

          if (layer.type === "vector") {
            await composer.addVectorSubStyle(layer, {
              opacity: layer.opacity,
              markerSymbolSize,
              zIndex: i,
            });
          } else if (layer.type === "geojson") {
            const meta = await composer.addGeoJsonSubStyle(id, layer.data!, {
              zIndex: i,
              clusteringEnabled,
            });
            geoMeta.push(meta);
          } else if (layer.type === "wms" || layer.type === "wmts") {
            composer.addRasterSubStyle(id, layer, { zIndex: i });
          } else if (layer.type === "cog") {
            composer.addCogSubStyle(id, layer, { zIndex: i });
          }
        }

        prevKeysRef.current = newKeys;
        prevIdsRef.current = newIds;

        onGeoJsonMetadataUpdate(geoMeta);

        // Build mapping for vector layers (skip background vector layers)
        // getVectorMapping keys by capabilitiesLayer || name, but layer-id metadata
        // uses the slugified URL. Re-key so the click handler can find mappings.
        const vectorLayers = (layers || []).filter(
          (l): l is Extract<LibreLayer, { type: "vector" }> => l.type === "vector"
        );
        const rawMapping: Record<string, string[] | string> = vectorLayers.length > 0
          ? await getVectorMapping(vectorLayers)
          : {};
        const mapping: Record<string, string[] | string> = {};
        for (const vl of vectorLayers) {
          const oldKey = vl.name;
          const newKey = slugifyUrl(vl.style!);
          if (rawMapping[oldKey]) {
            mapping[newKey] = rawMapping[oldKey];
            mapping[oldKey] = rawMapping[oldKey]; // keep original key too
          }
        }
        // GeoJSON layer mappings
        (layers || []).forEach((l, idx) => {
          if (l.type === "geojson" && l.infoboxMapping && l.infoboxMapping.length > 0) {
            const geoId = subStyleId(l, vectorBackgroundLayers.length + idx);
            mapping[l.name] = l.infoboxMapping;
            mapping[`${geoId}::geojson`] = l.infoboxMapping;
          }
        });
        onMappingUpdate(mapping);

        // Notify that the style is ready
        const currentStyle = mapInst.getStyle();
        if (currentStyle) {
          if (debugLog) console.log("[LAYER_MODE] imperative: derived style", currentStyle);
          onStyleReady(currentStyle);
        }

        // Refresh HidingForwardingManager
        onHidingManagerRefresh();

        // Apply filter
        if (filterFunction) {
          filterFunction(mapInst, layers);
        }
      } finally {
        isApplyingRef.current = false;
      }
    },
    [
      vectorBackgroundLayers,
      layers,
      clusteringEnabled,
      markerSymbolSize,
      filterFunction,
      onMappingUpdate,
      onGeoJsonMetadataUpdate,
      onStyleReady,
      onHidingManagerRefresh,
    ]
  );

  // Effect 1: Create/destroy composer when map becomes available
  useEffect(() => {
    if (!enabled || !map) {
      composerRef.current = null;
      return;
    }
    composerRef.current = new StyleComposer(map, debugLog);
    return () => {
      composerRef.current?.destroy();
      composerRef.current = null;
      prevKeysRef.current = [];
      prevIdsRef.current = [];
    };
  }, [enabled, map]);

  // Effect 2: When background style changes, reset the map style and re-add all layers
  useEffect(() => {
    if (!enabled || !map || !backgroundStyle) return;
    let aborted = false;

    const resetAndApply = () => {
      if (aborted) return;
      if (debugLog) console.log("[LAYER_MODE] imperative: resetAndApply firing, setting base style + adding layers");

      // Set base style with glyphs included (overrideGlyphs must be set for imperative mode
      // when the background style has no glyphs, e.g. backgroundLayers="")
      const baseStyle: StyleSpecification = {
        ...backgroundStyle,
        ...(overrideGlyphs ? { glyphs: overrideGlyphs } : {}),
      };

      map.setStyle(baseStyle);

      // Wait for style to load, then apply all layers
      const onStyleLoad = () => {
        if (aborted) return;
        // Re-create composer with fresh map state
        composerRef.current?.destroy();
        composerRef.current = new StyleComposer(map, debugLog);
        prevKeysRef.current = [];
        prevIdsRef.current = [];
        void applyAllLayers(composerRef.current, map);
      };

      if (map.isStyleLoaded()) {
        onStyleLoad();
      } else {
        map.once("styledata", onStyleLoad);
      }
    };

    resetAndApply();
    return () => {
      aborted = true;
    };
  }, [enabled, map, backgroundStyle, overrideGlyphs, applyAllLayers]);

  // Effect 3: Diff layer changes (when layers/clusteringEnabled/markerSymbolSize change
  // but background stays the same)
  useEffect(() => {
    if (!enabled || !map || !composerRef.current) return;
    if (!map.isStyleLoaded()) return;
    let aborted = false;

    const diffAndApply = async () => {
      const composer = composerRef.current;
      if (!composer || aborted) return;
      // Skip if a full applyAllLayers is already in progress (race with Effect 2)
      if (isApplyingRef.current) return;

      const effectiveLayers = [
        ...vectorBackgroundLayers,
        ...(layers || []),
      ];

      const newKeys = effectiveLayers.map((l, i) => layerKey(l, i));
      const newIds = effectiveLayers.map((l, i) => subStyleId(l, i));
      const oldKeys = prevKeysRef.current;
      const oldIds = prevIdsRef.current;

      // If keys haven't changed, nothing to do
      if (
        newKeys.length === oldKeys.length &&
        newKeys.every((k, i) => k === oldKeys[i])
      ) {
        return;
      }

      // Find removed and added
      const oldKeySet = new Set(oldKeys);
      const newKeySet = new Set(newKeys);

      // Remove sub-styles that are no longer present
      for (let i = 0; i < oldKeys.length; i++) {
        if (!newKeySet.has(oldKeys[i])) {
          composer.removeSubStyle(oldIds[i]);
        }
      }

      // Add sub-styles that are new
      const geoMeta: GeoJsonSubStyleMeta[] = [];
      for (let i = 0; i < effectiveLayers.length; i++) {
        if (aborted) return;
        if (!oldKeySet.has(newKeys[i])) {
          const layer = effectiveLayers[i];
          const id = newIds[i];

          if (layer.type === "vector") {
            await composer.addVectorSubStyle(layer, {
              opacity: layer.opacity,
              markerSymbolSize,
              zIndex: i,
            });
          } else if (layer.type === "geojson") {
            const meta = await composer.addGeoJsonSubStyle(id, layer.data!, {
              zIndex: i,
              clusteringEnabled,
            });
            geoMeta.push(meta);
          } else if (layer.type === "wms" || layer.type === "wmts") {
            composer.addRasterSubStyle(id, layer, { zIndex: i });
          } else if (layer.type === "cog") {
            composer.addCogSubStyle(id, layer, { zIndex: i });
          }
        }
      }

      if (aborted) return;

      prevKeysRef.current = newKeys;
      prevIdsRef.current = newIds;

      if (geoMeta.length > 0) {
        onGeoJsonMetadataUpdate(geoMeta);
      }

      // Update mapping (re-key by slugified URL to match layer-id metadata)
      const vectorLayers2 = (layers || []).filter(
        (l): l is Extract<LibreLayer, { type: "vector" }> => l.type === "vector"
      );
      const rawMapping2: Record<string, string[] | string> = vectorLayers2.length > 0
        ? await getVectorMapping(vectorLayers2)
        : {};
      if (aborted) return;
      const mapping: Record<string, string[] | string> = {};
      for (const vl of vectorLayers2) {
        const oldKey = vl.name;
        const newKey = slugifyUrl(vl.style!);
        if (rawMapping2[oldKey]) {
          mapping[newKey] = rawMapping2[oldKey];
          mapping[oldKey] = rawMapping2[oldKey];
        }
      }
      (layers || []).forEach((l, idx) => {
        if (l.type === "geojson" && l.infoboxMapping && l.infoboxMapping.length > 0) {
          const geoId = subStyleId(l, vectorBackgroundLayers.length + idx);
          mapping[l.name] = l.infoboxMapping;
          mapping[`${geoId}::geojson`] = l.infoboxMapping;
        }
      });
      onMappingUpdate(mapping);

      onHidingManagerRefresh();

      if (filterFunction) {
        filterFunction(map, layers);
      }
    };

    void diffAndApply();
    return () => {
      aborted = true;
    };
  }, [
    enabled,
    map,
    layers,
    vectorBackgroundLayers,
    clusteringEnabled,
    markerSymbolSize,
    filterFunction,
    onMappingUpdate,
    onGeoJsonMetadataUpdate,
    onHidingManagerRefresh,
  ]);
}
