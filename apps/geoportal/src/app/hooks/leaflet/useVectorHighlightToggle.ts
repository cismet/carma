import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useMapHighlight } from "@carma-mapping/engines/maplibre";

/**
 * Click -> toggle highlight bridge for Geoportal.
 *
 * This is the body of `useMapHighlighting`'s own modifier+click handler,
 * re-driven from a different click source. We can't use the built-in one:
 * Geoportal's MapLibre canvases are non-interactive overlays inside Leaflet
 * panes, so `map.on("click")` never fires. Leaflet gets the click instead, and
 * hands us a latlng — which we project into each map's pixel space to run the
 * same `queryRenderedFeatures` hit test.
 *
 * Behaviour: first toggle switches highlighting on (everything else dims);
 * every further click adds a feature; clicking an already-highlighted feature
 * removes it (the XOR in `matchesCriteria`). When the last one is removed the
 * mode switches off again, so the map returns to untouched.
 *
 * NOTE: currently bound to a plain click. Gate on `e.originalEvent.altKey` at
 * the call site to make it alt+click.
 */

// queryRenderedFeatures on an exact pixel misses thin lines and small icons;
// a small box around the click is what makes this usable.
const HIT_TOLERANCE_PX = 6;

const DEBUG = true;
const log = (...args: unknown[]) => {
  if (DEBUG) console.log("xxx [highlight-toggle]", ...args);
};

const isExcludedLayer = (layerId: string) => {
  const id = layerId.toLowerCase();
  return id.includes("selection") || id.includes("background");
};

const useVectorHighlightToggle = (
  maplibreMapsRef: MutableRefObject<Map<string, MaplibreMap>>
) => {
  const {
    highlightingActive,
    setHighlightingActive,
    toggleFeatureHighlight,
    criteria,
  } = useMapHighlight();

  return useCallback(
    (lat: number, lng: number): boolean => {
      log("click", { lat, lng, maps: maplibreMapsRef.current.size });
      for (const [layerId, map] of maplibreMapsRef.current) {
        let point: { x: number; y: number };
        try {
          if (!map.isStyleLoaded()) {
            log(layerId, "style not loaded");
            continue;
          }
          point = map.project([lng, lat]);
        } catch (e) {
          log(layerId, "project failed", e);
          continue;
        }

        const bbox: [[number, number], [number, number]] = [
          [point.x - HIT_TOLERANCE_PX, point.y - HIT_TOLERANCE_PX],
          [point.x + HIT_TOLERANCE_PX, point.y + HIT_TOLERANCE_PX],
        ];

        let hits: ReturnType<MaplibreMap["queryRenderedFeatures"]>;
        try {
          hits = map.queryRenderedFeatures(bbox);
        } catch (e) {
          log(layerId, "queryRenderedFeatures failed", e);
          continue;
        }
        log(layerId, "hits", {
          count: hits.length,
          features: hits.map((f) => ({
            layer: f.layer.id,
            source: f.source,
            sourceLayer: f.sourceLayer,
            id: f.id,
          })),
        });

        const feature = hits.find((f) => {
          if (f.id == null || !f.source) return false;
          if (isExcludedLayer(f.layer.id)) return false;
          // Vector tiles always carry sourceLayer; geojson features don't,
          // and we accept them.
          if (f.sourceLayer) return true;
          return map.getSource(f.source)?.type === "geojson";
        });
        if (!feature) {
          log(layerId, "no usable feature (needs non-null id + source)");
          continue;
        }

        const isGeojson = map.getSource(feature.source)?.type === "geojson";
        const effectiveSourceLayer =
          feature.sourceLayer ??
          (isGeojson
            ? String(
                (feature.properties as Record<string, unknown> | undefined)
                  ?._sourceLayer ?? ""
              )
            : "");

        const key = `${feature.source}::${effectiveSourceLayer}::${feature.id}`;
        const wasOnlyToggled =
          criteria.toggledFeatures.size === 1 &&
          criteria.toggledFeatures.has(key);

        toggleFeatureHighlight({
          source: feature.source,
          sourceLayer: effectiveSourceLayer,
          id: feature.id,
        });

        // Turn the mode on with the first highlight, and off again when the
        // last one is removed — otherwise the map would stay dimmed with
        // nothing bright.
        if (wasOnlyToggled) {
          setHighlightingActive(false);
        } else if (!highlightingActive) {
          setHighlightingActive(true);
        }

        log("toggled", key, {
          wasOnlyToggled,
          nowActive: !wasOnlyToggled,
          toggledCount: criteria.toggledFeatures.size,
        });
        return true;
      }
      log("no feature hit in any map");
      return false;
    },
    [
      maplibreMapsRef,
      criteria,
      highlightingActive,
      setHighlightingActive,
      toggleFeatureHighlight,
    ]
  );
};

export default useVectorHighlightToggle;
