/**
 * useImperativeStyle: React hook wrapping StyleComposer for lifecycle management.
 *
 * Handles:
 * - Creating/destroying the StyleComposer when the map instance is available
 * - Diffing the layers prop to add/remove sub-styles incrementally
 * - Re-applying all layers when the background style changes
 * - Providing geoJsonMetadata for cluster marker rendering
 */

import { useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap, StyleSpecification } from "maplibre-gl";
import {
  StyleComposer,
  slugifyUrl,
  type GeoJsonSubStyleMeta,
} from "../utils/styleComposer";
import type { LibreLayer } from "../components/LibreMap";
import { getVectorMapping } from "../utils/styleBuilder";
import {
  notifyMapLibreStyleCompositionReady,
  notifyMapLibreStyleCompositionStarted,
} from "../lib/runtime/integrations/map-style-layer-suppression";
import {
  getLibreLayerCompositionKey,
  getLibreLayerSubStyleId,
} from "../lib/style-composition/libre-layer-identity";

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
  onGeoJsonMetadataUpdate: (
    meta: Array<{ sourceId: string; uniqueColors: string[] }>
  ) => void;
  onStyleReady: (style: StyleSpecification) => void;
  onHidingManagerRefresh: () => void;
}

interface AppliedSubStyle {
  id: string;
  opacity: number;
  geoMeta?: GeoJsonSubStyleMeta;
}

const layerOpacity = (layer: LibreLayer) =>
  ("opacity" in layer ? layer.opacity : undefined) ?? 1;

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
  // What the composer actually holds, keyed by composition key + sub-style id.
  // The id contains the layer index, so a layer whose index shifts must be
  // re-added; matching by key alone left it under a stale id that later
  // removals and opacity updates never hit.
  const appliedRef = useRef<Map<string, AppliedSubStyle>>(new Map());
  // Reconciles run one after another so overlapping async adds cannot
  // corrupt the applied state.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [styleRetry, setStyleRetry] = useState(0);
  // setStyle is in flight; its full reconcile will pick up the latest layers.
  const styleResetPendingRef = useRef(false);

  const latestRef = useRef({
    layers,
    vectorBackgroundLayers,
    clusteringEnabled,
    filterFunction,
    onMappingUpdate,
    onGeoJsonMetadataUpdate,
    onStyleReady,
    onHidingManagerRefresh,
  });
  latestRef.current = {
    layers,
    vectorBackgroundLayers,
    clusteringEnabled,
    filterFunction,
    onMappingUpdate,
    onGeoJsonMetadataUpdate,
    onStyleReady,
    onHidingManagerRefresh,
  };
  const markerSymbolSizeRef = useRef(markerSymbolSize);
  markerSymbolSizeRef.current = markerSymbolSize;

  const reconcile = async (
    composer: StyleComposer,
    mapInst: MaplibreMap,
    full: boolean
  ) => {
    const isStale = () => composerRef.current !== composer;
    if (isStale()) return;

    const {
      layers: currentLayers,
      vectorBackgroundLayers: bgLayers,
      clusteringEnabled: clustering,
      filterFunction: filter,
    } = latestRef.current;
    const effectiveLayers = [...bgLayers, ...(currentLayers || [])];
    const ids = effectiveLayers.map(getLibreLayerSubStyleId);
    const identities = effectiveLayers.map(
      (layer, i) => `${getLibreLayerCompositionKey(layer, i)}|${ids[i]}`
    );
    const applied = appliedRef.current;
    const wanted = new Set(identities);

    if (debugLog)
      console.log(
        "[LAYER_MODE] imperative: reconcile, count:",
        effectiveLayers.length,
        "full:",
        full
      );

    let structureChanged = full;
    for (const [identity, entry] of [...applied]) {
      if (!wanted.has(identity)) {
        composer.removeSubStyle(entry.id);
        applied.delete(identity);
        structureChanged = true;
      }
    }

    let opacityChanged = false;
    for (let i = 0; i < effectiveLayers.length; i++) {
      const layer = effectiveLayers[i];
      const id = ids[i];
      const identity = identities[i];
      const opacity = layerOpacity(layer);
      const existing = applied.get(identity);

      if (existing) {
        if (existing.opacity !== opacity) {
          const transition =
            "opacityTransition" in layer ? layer.opacityTransition : undefined;
          if (layer.type === "vector") {
            composer.updateVectorOpacity(id, opacity, transition);
          } else if (
            layer.type === "wms" ||
            layer.type === "wmts" ||
            layer.type === "tiles" ||
            layer.type === "cog"
          ) {
            composer.updateRasterOpacity(id, opacity, transition);
          }
          existing.opacity = opacity;
          opacityChanged = true;
        }
        continue;
      }

      // Insert before the next sub-style already on the map so the last
      // layer stays on top.
      let beforeId: string | undefined;
      for (let j = i + 1; j < ids.length; j++) {
        if (applied.has(identities[j])) {
          beforeId = `---${ids[j]}:first---`;
          break;
        }
      }

      let geoMeta: GeoJsonSubStyleMeta | undefined;
      if (layer.type === "vector") {
        await composer.addVectorSubStyle(layer, {
          opacity: layer.opacity,
          markerSymbolSize: markerSymbolSizeRef.current,
          zIndex: i,
          beforeId,
        });
      } else if (layer.type === "geojson") {
        geoMeta = await composer.addGeoJsonSubStyle(id, layer.data!, {
          zIndex: i,
          clusteringEnabled: clustering,
          beforeId,
          carmaLayerId: layer.carmaLayerId,
        });
      } else if (layer.type === "wms" || layer.type === "wmts") {
        composer.addRasterSubStyle(id, layer, { zIndex: i, beforeId });
      } else if (layer.type === "tiles") {
        composer.addTilesSubStyle(id, layer, { zIndex: i, beforeId });
      } else if (layer.type === "cog") {
        composer.addCogSubStyle(id, layer, { zIndex: i, beforeId });
      }
      // Composer was replaced while awaiting; its own reconcile takes over.
      if (isStale()) return;
      applied.set(identity, { id, opacity, geoMeta });
      structureChanged = true;
    }

    if (!structureChanged) {
      if (opacityChanged) notifyMapLibreStyleCompositionReady(mapInst);
      return;
    }

    latestRef.current.onGeoJsonMetadataUpdate(
      [...applied.values()].flatMap((e) => (e.geoMeta ? [e.geoMeta] : []))
    );

    // getVectorMapping keys by capabilitiesLayer || name, but layer-id metadata
    // uses the slugified URL. Re-key so the click handler can find mappings.
    const vectorLayers = (currentLayers || []).filter(
      (l): l is Extract<LibreLayer, { type: "vector" }> => l.type === "vector"
    );
    const rawMapping: Record<string, string[] | string> =
      vectorLayers.length > 0 ? await getVectorMapping(vectorLayers) : {};
    if (isStale()) return;
    const mapping: Record<string, string[] | string> = {};
    for (const vl of vectorLayers) {
      const oldKey = vl.name;
      const newKey =
        typeof vl.style === "string" ? slugifyUrl(vl.style) : vl.name;
      if (rawMapping[oldKey]) {
        mapping[newKey] = rawMapping[oldKey];
        mapping[oldKey] = rawMapping[oldKey];
      }
    }
    (currentLayers || []).forEach((l, idx) => {
      if (
        l.type === "geojson" &&
        l.infoboxMapping &&
        l.infoboxMapping.length > 0
      ) {
        const geoId = ids[bgLayers.length + idx];
        mapping[l.name] = l.infoboxMapping;
        mapping[`${geoId}::geojson`] = l.infoboxMapping;
      }
    });
    latestRef.current.onMappingUpdate(mapping);

    if (full) {
      const currentStyle = mapInst.getStyle();
      if (currentStyle) {
        if (debugLog)
          console.log("[LAYER_MODE] imperative: derived style", currentStyle);
        latestRef.current.onStyleReady(currentStyle);
      }
    }

    latestRef.current.onHidingManagerRefresh();
    if (filter) filter(mapInst, currentLayers);
    notifyMapLibreStyleCompositionReady(mapInst);
  };

  const enqueueReconcile = (
    composer: StyleComposer,
    mapInst: MaplibreMap,
    full: boolean
  ) => {
    queueRef.current = queueRef.current
      .then(() => reconcile(composer, mapInst, full))
      .catch((error: unknown) => {
        console.error("[LAYER_MODE] imperative: reconcile failed", error);
      });
  };
  const enqueueReconcileRef = useRef(enqueueReconcile);
  enqueueReconcileRef.current = enqueueReconcile;

  // Effect 1: Create/destroy composer when map becomes available
  useEffect(() => {
    if (!enabled || !map) {
      composerRef.current = null;
      return;
    }
    composerRef.current = new StyleComposer(map, debugLog);
    appliedRef.current = new Map();
    return () => {
      composerRef.current?.destroy();
      composerRef.current = null;
      appliedRef.current = new Map();
    };
  }, [enabled, map]);

  // Effect 2: When background style changes, reset the map style and re-add all layers
  useEffect(() => {
    if (!enabled || !map || !backgroundStyle) return;
    let aborted = false;

    if (debugLog)
      console.log(
        "[LAYER_MODE] imperative: resetAndApply firing, setting base style + adding layers"
      );

    // Set base style with glyphs included (overrideGlyphs must be set for imperative mode
    // when the background style has no glyphs, e.g. backgroundLayers="")
    const baseStyle: StyleSpecification = {
      ...backgroundStyle,
      ...(overrideGlyphs ? { glyphs: overrideGlyphs } : {}),
    };

    notifyMapLibreStyleCompositionStarted(map);
    styleResetPendingRef.current = true;
    map.setStyle(baseStyle);

    const onStyleLoad = () => {
      if (aborted) return;
      styleResetPendingRef.current = false;
      // setStyle dropped every sub-style; start over with a fresh composer.
      composerRef.current?.destroy();
      const composer = new StyleComposer(map, debugLog);
      composerRef.current = composer;
      appliedRef.current = new Map();
      enqueueReconcileRef.current(composer, map, true);
    };

    if (map.isStyleLoaded()) {
      onStyleLoad();
    } else {
      map.once("styledata", onStyleLoad);
    }
    return () => {
      aborted = true;
      map.off("styledata", onStyleLoad);
    };
  }, [enabled, map, backgroundStyle, overrideGlyphs]);

  // Effect 3: Diff layer changes (when layers/clusteringEnabled change but
  // background stays the same). The reconcile reads the latest props itself.
  useEffect(() => {
    const composer = composerRef.current;
    if (!enabled || !map || !composer || styleResetPendingRef.current) return;
    // Only the base style must be parsed. isStyleLoaded() also waits for tiles,
    // so a change arriving while tiles load would be lost.
    if (!map.getStyle()) {
      const retry = () => setStyleRetry((n) => n + 1);
      map.once("styledata", retry);
      return () => {
        map.off("styledata", retry);
      };
    }
    enqueueReconcileRef.current(composer, map, false);
  }, [
    enabled,
    map,
    layers,
    vectorBackgroundLayers,
    clusteringEnabled,
    filterFunction,
    styleRetry,
  ]);
}
