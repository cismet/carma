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
import type { DrawShape } from "../lib/LassoDrawingManager";
import { useMapHighlight } from "../contexts/MapHighlightContext";

export interface UseLassoHighlightOptions {
  map: MaplibreMap | null;
  /** Whether lasso mode is currently active (controlled by toolbar toggle). */
  active: boolean;
  /**
   * Shape the explicit (toolbar-driven) manager draws. The passive Alt+drag
   * manager always stays a freehand lasso. Default: "lasso"
   */
  shape?: DrawShape;
  /** Radius in metres a clicked circle gets. */
  circleRadius?: number;
  /** Dragged radii snap to a multiple of this, in metres. */
  radiusStep?: number;
  /** Reports the radius a drag settled on, so the UI can show the new value. */
  onCircleRadiusChange?: (radiusMeters: number) => void;
  /** Filter results to specific sources. If omitted, all rendered features are candidates. */
  sources?: Array<{ source: string; sourceLayers: string[] }>;
  /** Called when the user presses Escape to exit lasso mode. */
  onDeactivate?: () => void;
  /** Called after lasso completes with the toggled features (for sidebar updates). */
  onToggle?: (feature: MapGeoJSONFeature) => void;
  /**
   * Called once after lasso completes with every matched feature, deduplicated
   * and with `sourceLayer` stamped on geojson hits. Prefer this over `onToggle`
   * for sidebar updates: `onToggle` fires per feature, so a source query inside
   * it runs hundreds of times on a large lasso.
   */
  onMatched?: (features: MapGeoJSONFeature[]) => void;
}

export interface UseLassoHighlightResult {
  /** True while the user is holding the mouse button and drawing. */
  isDrawing: boolean;
}

export const useLassoHighlight = ({
  map,
  active,
  shape = "lasso",
  circleRadius,
  radiusStep,
  onCircleRadiusChange,
  sources,
  onDeactivate,
  onToggle,
  onMatched,
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
  const onMatchedRef = useRef(onMatched);
  onMatchedRef.current = onMatched;
  const onCircleRadiusChangeRef = useRef(onCircleRadiusChange);
  onCircleRadiusChangeRef.current = onCircleRadiusChange;

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
        // Geojson features carry no native sourceLayer; the convention
        // is to stamp it into properties._sourceLayer.
        const isGeojson = map.getSource(featureSource)?.type === "geojson";
        const featureSourceLayer = isGeojson
          ? String(
              (f.properties as Record<string, unknown>)?._sourceLayer ??
                f.sourceLayer ??
                ""
            )
          : f.sourceLayer ?? "";
        if (isGeojson && !f.sourceLayer) {
          (f as MapGeoJSONFeature & { sourceLayer?: string }).sourceLayer =
            featureSourceLayer;
        }

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

      setActiveRef.current(true);

      // When a consumer supplies onMatched, it takes FULL ownership of highlight
      // state: it expands each hit to its whole Standort/Leuchten cluster and
      // drives feature-state directly. Toggling the raw hits here as well would
      // double-flip them — and on top of an expert search (hits lit via queryIds,
      // toggledFeatures being an XOR) it would split the cluster instead of
      // toggling it as a unit. Hand the matches over and stop.
      if (onMatchedRef.current) {
        onMatchedRef.current(matched);
        return;
      }

      // 5. Standalone path (no cluster-aware consumer): toggle each matched
      //    feature ourselves. Uses ensureToggledFeatures (idempotent) to avoid
      //    double-toggle across overlapping lassos.
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

  // Create/destroy manager when map changes. Shape and radius are handed over
  // as initial values only and updated through setters below, so switching the
  // shape in the toolbar does not tear the source and its layers down.
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const circleRadiusRef = useRef(circleRadius);
  circleRadiusRef.current = circleRadius;
  const radiusStepRef = useRef(radiusStep);
  radiusStepRef.current = radiusStep;

  useEffect(() => {
    if (!map) return;

    const manager = new LassoDrawingManager({
      map,
      onDrawComplete: handleDrawComplete,
      onDrawCancel: handleDrawCancel,
      shape: shapeRef.current,
      circleRadius: circleRadiusRef.current,
      radiusStep: radiusStepRef.current,
      onRadiusChange: (radius) => onCircleRadiusChangeRef.current?.(radius),
    });
    managerRef.current = manager;

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [map, handleDrawComplete, handleDrawCancel]);

  useEffect(() => {
    managerRef.current?.setShape(shape);
  }, [shape]);

  useEffect(() => {
    if (circleRadius != null) {
      managerRef.current?.setCircleRadius(circleRadius);
    }
  }, [circleRadius]);

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
