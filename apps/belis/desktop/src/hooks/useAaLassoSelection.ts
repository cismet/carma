import { useEffect, useRef, useCallback } from "react";
import { LassoDrawingManager } from "@carma-mapping/engines/maplibre";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Feature, LineString, Point, Polygon } from "geojson";
import {
  polygon as turfPolygon,
  booleanPointInPolygon,
  booleanIntersects,
  lineString as turfLineString,
} from "@turf/turf";
import type { LassoSelectedFeature } from "../store/slices/arbeitsauftraege";

interface UseAaLassoSelectionOptions {
  map: MaplibreMap | null;
  active: boolean;
  onDeactivate?: () => void;
  onFeaturesSelected?: (features: LassoSelectedFeature[]) => void;
}

export function useAaLassoSelection({
  map,
  active,
  onDeactivate,
  onFeaturesSelected,
}: UseAaLassoSelectionOptions) {
  const managerRef = useRef<LassoDrawingManager | null>(null);
  const onDeactivateRef = useRef(onDeactivate);
  onDeactivateRef.current = onDeactivate;
  const onFeaturesSelectedRef = useRef(onFeaturesSelected);
  onFeaturesSelectedRef.current = onFeaturesSelected;

  const handleDrawComplete = useCallback(
    (drawnShape: Polygon | LineString) => {
      if (!map) return;

      // 1. Compute pixel bounding box from the shape's vertices
      const ring =
        drawnShape.type === "Polygon"
          ? drawnShape.coordinates[0]
          : drawnShape.coordinates;
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
      const bboxSW: [number, number] = [minX - 1, minY - 1];
      const bboxNE: [number, number] = [maxX + 1, maxY + 1];

      // 2. Query rendered features in bounding box
      const candidates = map.queryRenderedFeatures([bboxSW, bboxNE]);

      // 3. Build the turf geometry for the spatial test
      const turfLasso =
        drawnShape.type === "Polygon"
          ? turfPolygon(drawnShape.coordinates)
          : turfLineString(drawnShape.coordinates);

      // 4. Spatial test – keep every feature whose geometry falls inside the lasso
      const seen = new Set<string | number>();
      const matched: typeof candidates = [];

      for (const f of candidates) {
        if (!f.geometry) continue;
        if (f.id != null && seen.has(f.id)) continue;

        let inside = false;
        try {
          if (
            f.geometry.type === "Point" &&
            turfLasso.geometry.type === "Polygon"
          ) {
            inside = booleanPointInPolygon(
              f.geometry as Point,
              turfLasso as Feature<Polygon>
            );
          } else if (f.geometry.type === "Point") {
            // a point against a bare line practically never matches — that is
            // what the corridor width is for
            inside = booleanIntersects(f.geometry, turfLasso);
          } else if (f.geometry.type === "LineString") {
            const line = turfLineString(f.geometry.coordinates);
            inside = booleanIntersects(line, turfLasso);
          }
        } catch {
          continue;
        }

        if (!inside) continue;

        if (f.id != null) seen.add(f.id);
        matched.push(f);
      }

      const serialized = matched.map((f) => ({
        id: f.id,
        source: f.source,
        sourceLayer: f.sourceLayer,
        properties: f.properties as Record<string, unknown>,
        geometry: f.geometry,
      }));

      if (serialized.length > 0) {
      } else {
      }

      onFeaturesSelectedRef.current?.(serialized);

      // Deactivate after draw
      onDeactivateRef.current?.();
    },
    [map]
  );

  const handleDrawCancel = useCallback(() => {
    // stay in lasso mode on cancel (user can try again)
  }, []);

  // Create / destroy manager when map changes
  useEffect(() => {
    if (!map) return;

    const mgr = new LassoDrawingManager({
      map,
      onDrawComplete: handleDrawComplete,
      onDrawCancel: handleDrawCancel,
    });
    managerRef.current = mgr;

    return () => {
      mgr.destroy();
      managerRef.current = null;
    };
  }, [map, handleDrawComplete, handleDrawCancel]);

  // Activate / deactivate based on active prop
  useEffect(() => {
    const mgr = managerRef.current;
    if (!mgr) return;

    if (active) {
      mgr.activate();
    } else {
      mgr.deactivate();
    }
  }, [active]);

  // Escape key exits lasso mode
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
}
