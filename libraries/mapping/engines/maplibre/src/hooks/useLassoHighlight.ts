/**
 * useLassoHighlight - Connects LassoDrawingManager to MapHighlightContext.
 *
 * When the user completes a freehand lasso, this hook:
 * 1. Computes a pixel bounding box from the lasso polygon
 * 2. Queries rendered features in that bbox
 * 3. Post-filters by source/sourceLayer and spatial intersection (turf.js)
 * 4. Deduplicates and adds matches via ensureToggledFeatures
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Polygon, Point } from "geojson";
import {
  booleanPointInPolygon,
  booleanIntersects,
  polygon as turfPolygon,
} from "@turf/turf";
import { LassoDrawingManager } from "../lib/LassoDrawingManager";
import { useMapHighlight } from "../contexts/MapHighlightContext";

export interface UseLassoHighlightOptions {
  map: MaplibreMap | null;
  /** Whether lasso mode is currently active (controlled by toolbar toggle). */
  active: boolean;
  /** Filter results to specific sources. If omitted, all rendered features are candidates. */
  sources?: Array<{ source: string; sourceLayers: string[] }>;
  /** Called when the user presses Escape to exit lasso mode. */
  onDeactivate?: () => void;
  /** Called after lasso completes with the toggled features (for sidebar updates). */
  onToggle?: (feature: MapGeoJSONFeature) => void;
}

export interface UseLassoHighlightResult {
  /** True while the user is holding the mouse button and drawing. */
  isDrawing: boolean;
}

export const useLassoHighlight = ({
  map,
  active,
  sources,
  onDeactivate,
  onToggle,
}: UseLassoHighlightOptions): UseLassoHighlightResult => {
  const [isDrawing, setIsDrawing] = useState(false);
  const managerRef = useRef<LassoDrawingManager | null>(null);
  const passiveManagerRef = useRef<LassoDrawingManager | null>(null);
  const { setHighlightingActive, ensureToggledFeatures, criteria } =
    useMapHighlight();

  // Stable refs for the callback so we don't recreate the manager on every render
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const ensureRef = useRef(ensureToggledFeatures);
  ensureRef.current = ensureToggledFeatures;
  const criteriaRef = useRef(criteria);
  criteriaRef.current = criteria;
  const setActiveRef = useRef(setHighlightingActive);
  setActiveRef.current = setHighlightingActive;
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  const handleDrawComplete = useCallback(
    (lassoPolygon: Polygon) => {
      setIsDrawing(false);
      if (!map) return;

      // 1. Compute pixel bounding box from polygon vertices
      const ring = lassoPolygon.coordinates[0];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const coord of ring) {
        const px = map.project([coord[0], coord[1]]);
        if (px.x < minX) minX = px.x;
        if (px.y < minY) minY = px.y;
        if (px.x > maxX) maxX = px.x;
        if (px.y > maxY) maxY = px.y;
      }
      // Pad by 1px to catch edge features
      const bboxSW: [number, number] = [minX - 1, minY - 1];
      const bboxNE: [number, number] = [maxX + 1, maxY + 1];

      // 2. Query rendered features in bounding box
      const candidates = map.queryRenderedFeatures([bboxSW, bboxNE]);

      // 3. Build a turf polygon for spatial tests
      const turfLasso = turfPolygon(lassoPolygon.coordinates);

      // 4. Filter and spatial test
      const configuredSources = sourcesRef.current;
      const seen = new Set<string>();
      const matched: MapGeoJSONFeature[] = [];

      for (const f of candidates) {
        // Skip features without id (setFeatureState requires it)
        if (f.id == null) continue;
        // Skip lasso's own visual layer
        if (f.source === "__carma-lasso-source") continue;
        // Skip features without geometry
        if (!f.geometry) continue;

        const featureSource = f.source;
        const featureSourceLayer = f.sourceLayer ?? "";

        // Source filter: only keep features from configured sources
        if (configuredSources) {
          const match = configuredSources.some(
            (s) =>
              s.source === featureSource &&
              s.sourceLayers.includes(featureSourceLayer)
          );
          if (!match) continue;
        }

        // Spatial test
        let inside = false;
        try {
          if (f.geometry.type === "Point") {
            inside = booleanPointInPolygon(f.geometry as Point, turfLasso);
          } else {
            inside = booleanIntersects(f.geometry, turfLasso);
          }
        } catch {
          // If turf can't handle the geometry, skip
          continue;
        }

        if (!inside) continue;

        // Dedup by sourceLayer::databasePK (same pattern as useMapHighlighting)
        const dbId = String(
          (f.properties as Record<string, unknown>)?.id ?? f.id
        );
        const dedupKey = `${featureSourceLayer}::${dbId}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        matched.push(f);
      }

      if (matched.length === 0) return;

      // 5. Split into add/remove groups for per-feature toggle semantics.
      //    Uses ensureToggledFeatures (idempotent) to avoid double-toggle when
      //    Standort expansion adds sibling Leuchten also caught by the lasso.
      const currentToggled = criteriaRef.current.toggledFeatures;
      const toId = (f: MapGeoJSONFeature) => ({
        source: f.source,
        sourceLayer: f.sourceLayer ?? "",
        id: f.id!,
      });
      const toAdd = matched.filter((f) => {
        const key = `${f.source}::${f.sourceLayer ?? ""}::${f.id}`;
        return !currentToggled.has(key);
      });
      const toRemove = matched.filter((f) => {
        const key = `${f.source}::${f.sourceLayer ?? ""}::${f.id}`;
        return currentToggled.has(key);
      });

      setActiveRef.current(true);
      if (toAdd.length > 0) {
        ensureRef.current(toAdd.map(toId), true);
      }
      if (toRemove.length > 0) {
        ensureRef.current(toRemove.map(toId), false);
      }
      for (const feat of matched) {
        onToggleRef.current?.(feat);
      }
    },
    [map]
  );

  const handleDrawCancel = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Create/destroy manager when map changes
  useEffect(() => {
    if (!map) return;

    const manager = new LassoDrawingManager({
      map,
      onDrawComplete: handleDrawComplete,
      onDrawCancel: handleDrawCancel,
    });
    managerRef.current = manager;

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [map, handleDrawComplete, handleDrawCancel]);

  // Create/destroy passive Alt+drag manager (always-on when map exists).
  // Activate immediately unless explicit lasso mode is already on.
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (!map) return;

    const passive = new LassoDrawingManager({
      map,
      onDrawComplete: handleDrawComplete,
      onDrawCancel: handleDrawCancel,
      requireModifier: "alt",
    });
    passiveManagerRef.current = passive;
    if (!activeRef.current) {
      passive.activate();
    }

    return () => {
      passive.destroy();
      passiveManagerRef.current = null;
    };
  }, [map, handleDrawComplete, handleDrawCancel]);

  // Activate/deactivate when active prop changes.
  // When explicit lasso is on, deactivate the passive manager (avoid conflict).
  // When explicit lasso is off, activate the passive manager.
  useEffect(() => {
    const manager = managerRef.current;
    const passive = passiveManagerRef.current;

    if (active) {
      manager?.activate();
      passive?.deactivate();
    } else {
      manager?.deactivate();
      passive?.activate();
    }
  }, [active]);

  // Escape key exits lasso mode
  const onDeactivateRef = useRef(onDeactivate);
  onDeactivateRef.current = onDeactivate;
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDeactivateRef.current?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  // Track drawing state: poll from both managers on mouse events
  useEffect(() => {
    if (!map) return;

    const canvas = map.getCanvas();
    const updateDrawing = () => {
      const drawing =
        (managerRef.current?.isDrawing() ?? false) ||
        (passiveManagerRef.current?.isDrawing() ?? false);
      setIsDrawing((prev) => (prev !== drawing ? drawing : prev));
    };

    canvas.addEventListener("mousedown", updateDrawing);
    canvas.addEventListener("mouseup", updateDrawing);

    return () => {
      canvas.removeEventListener("mousedown", updateDrawing);
      canvas.removeEventListener("mouseup", updateDrawing);
    };
  }, [map]);

  return { isDrawing };
};
