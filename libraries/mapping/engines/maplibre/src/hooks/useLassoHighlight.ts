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
import type { Feature, Polygon, LineString, Point } from "geojson";
import {
  booleanPointInPolygon,
  booleanIntersects,
  polygon as turfPolygon,
  lineString as turfLineString,
} from "@turf/turf";
import { LassoDrawingManager, DEFAULT_COLOR } from "../lib/LassoDrawingManager";
import type {
  DrawShape,
  ModifierKey,
  RectSize,
} from "../lib/LassoDrawingManager";
import { useMapHighlight } from "../contexts/MapHighlightContext";
import { buildFeatureStateTarget } from "../utils/featureStateTarget";

type LassoSources = Array<{ source: string; sourceLayers: string[] }>;

/**
 * The click-per-vertex line belongs to the toolbar manager alone: on the
 * modifier-driven ones the same click already toggles a feature, and Enter /
 * double-click would have to be shared between four managers. They draw the
 * freehand lasso instead.
 */
const passiveShape = (shape: DrawShape): DrawShape =>
  shape === "line" ? "lasso" : shape;

/** Held down, the drag pans the map instead of drawing. */
const PAN_KEY = "Space";

/**
 * Space is the page's scroll key and the activation key of whatever has focus,
 * so the map only claims it while nothing else wants it.
 */
const spaceIsTaken = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    "input, textarea, select, button, [contenteditable=''], [contenteditable='true'], [role='button'], [role='textbox']"
  ) !== null;

/** Orange, to tell the refine lasso apart from the blue additive one. */
const REFINE_COLOR = "#f97316";
const ADD_COLOR = "#22c55e";
const SUBTRACT_COLOR = "#ec4899";

export type LassoOperation = "toggle" | "add" | "subtract" | "refine";

const OPERATION_COLORS: Record<LassoOperation, string> = {
  toggle: DEFAULT_COLOR,
  add: ADD_COLOR,
  subtract: SUBTRACT_COLOR,
  refine: REFINE_COLOR,
};

/**
 * Every feature of the configured sources the drawn shape covers, deduplicated
 * by sourceLayer + database id. Geojson hits get their `sourceLayer` stamped
 * from properties._sourceLayer (the CARMA convention).
 *
 * The shape is a polygon for every tool but the line, which hands over its bare
 * line when no corridor width is set: a line crosses areas just as well, and
 * exactly, but it can never cover a point feature.
 */
function collectFeaturesInPolygon(
  map: MaplibreMap,
  drawnShape: Polygon | LineString,
  configuredSources: LassoSources | undefined
): MapGeoJSONFeature[] {
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
  // Pad by 1px to catch edge features
  const bboxSW: [number, number] = [minX - 1, minY - 1];
  const bboxNE: [number, number] = [maxX + 1, maxY + 1];

  // 2. Query rendered features in bounding box
  const candidates = map.queryRenderedFeatures([bboxSW, bboxNE]);

  // 3. Build the turf geometry for the spatial tests
  const turfLasso =
    drawnShape.type === "Polygon"
      ? turfPolygon(drawnShape.coordinates)
      : turfLineString(drawnShape.coordinates);

  // 4. Filter and spatial test
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
      if (
        f.geometry.type === "Point" &&
        turfLasso.geometry.type === "Polygon"
      ) {
        inside = booleanPointInPolygon(
          f.geometry as Point,
          turfLasso as Feature<Polygon>
        );
      } else {
        // a point against a bare line lands here and will practically never
        // match — that is what the corridor width is for
        inside = booleanIntersects(f.geometry, turfLasso);
      }
    } catch {
      // If turf can't handle the geometry, skip
      continue;
    }

    if (!inside) continue;

    // Dedup by sourceLayer::databasePK (same pattern as useMapHighlighting)
    const dbId = String((f.properties as Record<string, unknown>)?.id ?? f.id);
    const dedupKey = `${featureSourceLayer}::${dbId}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    matched.push(f);
  }

  return matched;
}

export interface UseLassoHighlightOptions {
  map: MaplibreMap | null;
  /** Whether lasso mode is currently active (controlled by toolbar toggle). */
  active: boolean;
  /**
   * Shape a drag draws, for the toolbar-driven manager and the passive Alt+drag
   * shortcut alike. Default: "lasso"
   */
  shape?: DrawShape;
  /** Radius in metres a clicked circle gets. */
  circleRadius?: number;
  /** Ground size in metres a clicked rectangle gets. */
  rectSize?: RectSize;
  /** Dragged radii and edge lengths snap to a multiple of this, in metres. */
  radiusStep?: number;
  /** Metres every drawn shape grows by before it selects. */
  shapeBuffer?: number;
  /** Ms the finished shape stays on the map. Omitted: no delay. */
  clearDelay?: number;
  /** Reports a shape that can be shown and run again. `replayed`: it ran
   *  again, rather than a new one being drawn. */
  onLastShapeChange?: (
    hasLastShape: boolean,
    replayed: boolean,
    bufferMeters: number
  ) => void;
  /** Reports whether the last shape is currently shown on the map. */
  onLastShapePreviewChange?: (previewing: boolean) => void;
  /** Reports the radius a drag settled on, so the UI can show the new value. */
  onCircleRadiusChange?: (radiusMeters: number) => void;
  /** Reports the size a rectangle drag settled on. */
  onRectSizeChange?: (size: RectSize) => void;
  /** Filter results to specific sources. If omitted, all rendered features are candidates. */
  sources?: LassoSources;
  operation?: LassoOperation;
  /** One colour for every operation, instead of the per-operation defaults. */
  color?: string;
  refineActive?: boolean;
  onRefine?: (survivors: MapGeoJSONFeature[]) => void;
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
  /** Drops the line currently being placed. */
  cancelLine: () => void;
  /** Puts the last finished shape back on the map. */
  showLastShape: () => void;
  /** Takes that preview back down. */
  hideLastShape: () => void;
  /** Runs the remembered shape again — a line at the current width. */
  applyLastShape: () => void;
}

export const useLassoHighlight = ({
  map,
  active,
  shape = "lasso",
  circleRadius,
  rectSize,
  radiusStep,
  shapeBuffer,
  clearDelay,
  onLastShapeChange,
  onLastShapePreviewChange,
  onCircleRadiusChange,
  onRectSizeChange,
  sources,
  operation = "toggle",
  color,
  refineActive = false,
  onDeactivate,
  onToggle,
  onMatched,
  onRefine,
}: UseLassoHighlightOptions): UseLassoHighlightResult => {
  const [isDrawing, setIsDrawing] = useState(false);
  const managerRef = useRef<LassoDrawingManager | null>(null);
  const passiveManagerRef = useRef<LassoDrawingManager | null>(null);
  const refineManagerRef = useRef<LassoDrawingManager | null>(null);
  const shiftRefineManagerRef = useRef<LassoDrawingManager | null>(null);
  // Shift alone refines while the toolbar lasso is on and something is
  // highlighted — the window in which the toolbar manager must let Shift pass.
  const shiftRefineArmed = active && refineActive;
  const shiftRefineArmedRef = useRef(shiftRefineArmed);
  shiftRefineArmedRef.current = shiftRefineArmed;
  const skipForToolbar = (armed: boolean): ModifierKey[] =>
    armed ? ["shift"] : ["alt", "shift"];
  const {
    setHighlightingActive,
    ensureToggledFeatures,
    ensureSuppressedFeatures,
    clearHighlights,
    criteria,
  } = useMapHighlight();

  // Stable refs for the callback so we don't recreate the manager on every render
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  // the plain drag serves every operation, so which one runs is read from a ref
  // instead of swapping the managers' callbacks
  const operationRef = useRef(operation);
  operationRef.current = operation;
  const colorRef = useRef(color);
  colorRef.current = color;
  const ensureRef = useRef(ensureToggledFeatures);
  ensureRef.current = ensureToggledFeatures;
  const suppressRef = useRef(ensureSuppressedFeatures);
  suppressRef.current = ensureSuppressedFeatures;
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
  const onRectSizeChangeRef = useRef(onRectSizeChange);
  onRectSizeChangeRef.current = onRectSizeChange;
  const onRefineRef = useRef(onRefine);
  onRefineRef.current = onRefine;
  const clearRef = useRef(clearHighlights);
  clearRef.current = clearHighlights;

  const handleDrawComplete = useCallback(
    (lassoPolygon: Polygon | LineString) => {
      setIsDrawing(false);
      if (!map) return;

      const matched = collectFeaturesInPolygon(
        map,
        lassoPolygon,
        sourcesRef.current
      );

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

      // 5. Standalone path (no cluster-aware consumer): apply the operation
      //    ourselves. Uses ensureToggledFeatures (idempotent) to avoid
      //    double-toggle across overlapping lassos.
      const currentToggled = criteriaRef.current.toggledFeatures;
      const toId = (f: MapGeoJSONFeature) => ({
        source: f.source,
        sourceLayer: f.sourceLayer ?? "",
        id: f.id!,
      });

      if (operationRef.current === "add") {
        ensureRef.current(matched.map(toId), true);
        for (const feat of matched) {
          onToggleRef.current?.(feat);
        }
        return;
      }

      // suppression on top of the un-toggle, so a feature lit by a matcher or a
      // search hit disappears too instead of surviving the subtraction
      if (operationRef.current === "subtract") {
        ensureRef.current(matched.map(toId), false);
        suppressRef.current(matched.map(toId), true);
        for (const feat of matched) {
          onToggleRef.current?.(feat);
        }
        return;
      }
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

  /**
   * Refine (Alt+Shift): narrow the current highlight set to the part inside the
   * polygon. "Currently highlighted" is read from the map's own feature-state —
   * the single truth across every origin (street search via propertyMatchers,
   * expert search via queryIds, alt+click / lasso via toggledFeatures), so the
   * gesture behaves identically no matter how the selection was made.
   */
  const handleRefineComplete = useCallback(
    (lassoPolygon: Polygon | LineString) => {
      setIsDrawing(false);
      if (!map) return;

      const inside = collectFeaturesInPolygon(
        map,
        lassoPolygon,
        sourcesRef.current
      );
      const survivors = inside.filter((f) =>
        Boolean(
          map.getFeatureState(
            buildFeatureStateTarget(map, {
              source: f.source,
              sourceLayer: f.sourceLayer ?? "",
              id: f.id!,
            })
          ).highlighted
        )
      );

      // Nothing highlighted inside: treat as a stray gesture and keep the
      // current selection rather than wiping it.
      if (survivors.length === 0) return;

      if (onRefineRef.current) {
        onRefineRef.current(survivors);
        return;
      }

      // Standalone path: freeze the survivors into an explicit set. Clearing
      // first drops the matchers/queryIds that produced the original selection,
      // so features outside the polygon can no longer re-light when their tiles
      // reload on pan or zoom.
      clearRef.current();
      setActiveRef.current(true);
      ensureRef.current(
        survivors.map((f) => ({
          source: f.source,
          sourceLayer: f.sourceLayer ?? "",
          id: f.id!,
        })),
        true
      );
    },
    [map]
  );

  const handleDrawCancel = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleGestureComplete = useCallback(
    (lassoPolygon: Polygon | LineString) => {
      if (operationRef.current === "refine") {
        handleRefineComplete(lassoPolygon);
        return;
      }
      handleDrawComplete(lassoPolygon);
    },
    [handleDrawComplete, handleRefineComplete]
  );

  // Create/destroy manager when map changes. Shape and radius are handed over
  // as initial values only and updated through setters below, so switching the
  // shape in the toolbar does not tear the source and its layers down.
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const circleRadiusRef = useRef(circleRadius);
  circleRadiusRef.current = circleRadius;
  const rectSizeRef = useRef(rectSize);
  rectSizeRef.current = rectSize;
  const radiusStepRef = useRef(radiusStep);
  radiusStepRef.current = radiusStep;
  const shapeBufferRef = useRef(shapeBuffer);
  shapeBufferRef.current = shapeBuffer;
  const clearDelayRef = useRef(clearDelay);
  clearDelayRef.current = clearDelay;
  const onLastShapeChangeRef = useRef(onLastShapeChange);
  onLastShapeChangeRef.current = onLastShapeChange;
  const onLastShapePreviewChangeRef = useRef(onLastShapePreviewChange);
  onLastShapePreviewChangeRef.current = onLastShapePreviewChange;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!map) return;

    const manager = new LassoDrawingManager({
      map,
      onDrawComplete: handleGestureComplete,
      onDrawCancel: handleDrawCancel,
      color: colorRef.current ?? OPERATION_COLORS[operationRef.current],
      shape: shapeRef.current,
      circleRadius: circleRadiusRef.current,
      rectSize: rectSizeRef.current,
      radiusStep: radiusStepRef.current,
      shapeBuffer: shapeBufferRef.current,
      clearDelay: clearDelayRef.current,
      onLastShapeChange: (has, replayed, bufferMeters) =>
        onLastShapeChangeRef.current?.(has, replayed, bufferMeters),
      onLastShapePreviewChange: (previewing) =>
        onLastShapePreviewChangeRef.current?.(previewing),
      onRadiusChange: (radius) => onCircleRadiusChangeRef.current?.(radius),
      onRectSizeChange: (size) => onRectSizeChangeRef.current?.(size),
      // Starts on any plain mousedown, so it must stand back for whichever
      // refine combination is armed — otherwise both would draw at once.
      skipWhenModifiers: skipForToolbar(shiftRefineArmedRef.current),
    });
    managerRef.current = manager;
    // a fresh manager remembers no shape; the UI must not offer the old one
    onLastShapeChangeRef.current?.(manager.hasLastShape(), false, 0);
    // Recreated on map change — a new map instance comes with a fresh style,
    // which is exactly what selecting a feature can trigger. The effect below
    // only fires on `active` transitions, so without this the mode would still
    // be on while the manager that draws for it was never switched on.
    if (activeRef.current) manager.activate();

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [map, handleGestureComplete, handleDrawCancel]);

  // both managers, so the Alt+drag shortcut draws whatever the toolbar has
  // selected instead of always falling back to the freehand lasso
  useEffect(() => {
    managerRef.current?.setShape(shape);
    passiveManagerRef.current?.setShape(passiveShape(shape));
    refineManagerRef.current?.setShape(passiveShape(shape));
    shiftRefineManagerRef.current?.setShape(passiveShape(shape));
  }, [shape]);

  // every manager, so the width holds for the modifier gestures as well
  useEffect(() => {
    if (shapeBuffer == null) return;
    managerRef.current?.setShapeBuffer(shapeBuffer);
    passiveManagerRef.current?.setShapeBuffer(shapeBuffer);
    refineManagerRef.current?.setShapeBuffer(shapeBuffer);
    shiftRefineManagerRef.current?.setShapeBuffer(shapeBuffer);
  }, [shapeBuffer]);

  useEffect(() => {
    if (clearDelay == null) return;
    managerRef.current?.setClearDelay(clearDelay);
    passiveManagerRef.current?.setClearDelay(clearDelay);
    refineManagerRef.current?.setClearDelay(clearDelay);
    shiftRefineManagerRef.current?.setClearDelay(clearDelay);
  }, [clearDelay]);

  useEffect(() => {
    if (circleRadius != null) {
      managerRef.current?.setCircleRadius(circleRadius);
      passiveManagerRef.current?.setCircleRadius(circleRadius);
      refineManagerRef.current?.setCircleRadius(circleRadius);
      shiftRefineManagerRef.current?.setCircleRadius(circleRadius);
    }
  }, [circleRadius]);

  const rectWidth = rectSize?.width;
  const rectHeight = rectSize?.height;
  useEffect(() => {
    if (rectWidth != null && rectHeight != null) {
      const size = { width: rectWidth, height: rectHeight };
      managerRef.current?.setRectSize(size);
      passiveManagerRef.current?.setRectSize(size);
      refineManagerRef.current?.setRectSize(size);
      shiftRefineManagerRef.current?.setRectSize(size);
    }
  }, [rectWidth, rectHeight]);

  useEffect(() => {
    const next = color ?? OPERATION_COLORS[operation];
    managerRef.current?.setColor(next);
    passiveManagerRef.current?.setColor(next);
  }, [operation, color]);

  // Create/destroy passive Alt+drag manager (always-on when map exists).
  // Activate immediately unless explicit lasso mode is already on. It draws the
  // same shape as the toolbar; a plain Alt+click stays the feature toggle,
  // which the manager itself guards via `requireModifier`.
  useEffect(() => {
    if (!map) return;

    const passive = new LassoDrawingManager({
      map,
      onDrawComplete: handleGestureComplete,
      onDrawCancel: handleDrawCancel,
      color: colorRef.current ?? OPERATION_COLORS[operationRef.current],
      requireModifier: "alt",
      shape: passiveShape(shapeRef.current),
      circleRadius: circleRadiusRef.current,
      rectSize: rectSizeRef.current,
      radiusStep: radiusStepRef.current,
      clearDelay: clearDelayRef.current,
      shapeBuffer: shapeBufferRef.current,
      onRadiusChange: (radius) => onCircleRadiusChangeRef.current?.(radius),
      onRectSizeChange: (size) => onRectSizeChangeRef.current?.(size),
    });
    passiveManagerRef.current = passive;
    if (!activeRef.current) {
      passive.activate();
    }

    return () => {
      passive.destroy();
      passiveManagerRef.current = null;
    };
  }, [map, handleGestureComplete, handleDrawCancel]);

  // Alt+Shift refine manager. Armed by `refineActive` and independent of the
  // other two: the exact-modifier match keeps Alt-only and Alt+Shift apart.
  const refineActiveRef = useRef(refineActive);
  refineActiveRef.current = refineActive;
  useEffect(() => {
    if (!map) return;

    const refine = new LassoDrawingManager({
      map,
      onDrawComplete: handleRefineComplete,
      onDrawCancel: handleDrawCancel,
      requireModifier: ["alt", "shift"],
      color: REFINE_COLOR,
      allowClickPlacement: true,
      shape: passiveShape(shapeRef.current),
      circleRadius: circleRadiusRef.current,
      rectSize: rectSizeRef.current,
      radiusStep: radiusStepRef.current,
      clearDelay: clearDelayRef.current,
      shapeBuffer: shapeBufferRef.current,
      onRadiusChange: (radius) => onCircleRadiusChangeRef.current?.(radius),
      onRectSizeChange: (size) => onRectSizeChangeRef.current?.(size),
    });
    refineManagerRef.current = refine;
    // Recreated on map change: honor the current arming right away, the
    // effect below only fires on `refineActive` transitions.
    if (refineActiveRef.current) refine.activate();

    return () => {
      refine.destroy();
      refineManagerRef.current = null;
    };
  }, [map, handleRefineComplete, handleDrawCancel]);

  useEffect(() => {
    const refine = refineManagerRef.current;
    if (refineActive) refine?.activate();
    else refine?.deactivate();
  }, [refineActive]);

  // Shift-only refine, for when the toolbar lasso is switched on: there the
  // plain drag already draws, so Shift alone is the free gesture for "keep only
  // what's inside". Alt+Shift stays available for the same thing without the
  // toolbar, hence two managers rather than one.
  useEffect(() => {
    if (!map) return;

    const shiftRefine = new LassoDrawingManager({
      map,
      onDrawComplete: handleRefineComplete,
      onDrawCancel: handleDrawCancel,
      requireModifier: ["shift"],
      color: REFINE_COLOR,
      allowClickPlacement: true,
      shape: passiveShape(shapeRef.current),
      circleRadius: circleRadiusRef.current,
      rectSize: rectSizeRef.current,
      radiusStep: radiusStepRef.current,
      clearDelay: clearDelayRef.current,
      shapeBuffer: shapeBufferRef.current,
      onRadiusChange: (radius) => onCircleRadiusChangeRef.current?.(radius),
      onRectSizeChange: (size) => onRectSizeChangeRef.current?.(size),
    });
    shiftRefineManagerRef.current = shiftRefine;
    if (activeRef.current && refineActiveRef.current) shiftRefine.activate();

    return () => {
      shiftRefine.destroy();
      shiftRefineManagerRef.current = null;
    };
  }, [map, handleRefineComplete, handleDrawCancel]);

  // The toolbar manager starts on any plain mousedown, so it has to stand back
  // from Shift for exactly the window in which shift-refine is armed —
  // otherwise Shift would either draw two lassos or, once refine is off again,
  // fall through to MapLibre's box zoom instead of the normal blue lasso.
  useEffect(() => {
    const shiftRefine = shiftRefineManagerRef.current;
    if (shiftRefineArmed) shiftRefine?.activate();
    else shiftRefine?.deactivate();
    managerRef.current?.setSkipWhenModifiers(skipForToolbar(shiftRefineArmed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftRefineArmed]);

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

  /**
   * Hold Space to pan. The drag shapes switch `dragPan` off for the whole
   * gesture, so without this a lasso longer than the current view could not be
   * finished. Every manager is suspended, not just the toolbar one: whichever
   * modifier is held, Space means "this drag is the map's".
   */
  useEffect(() => {
    if (!map) return;

    const suspendAll = (suspended: boolean) => {
      managerRef.current?.setSuspended(suspended);
      passiveManagerRef.current?.setSuspended(suspended);
      refineManagerRef.current?.setSuspended(suspended);
      shiftRefineManagerRef.current?.setSuspended(suspended);
    };

    const handlePanKeyDown = (e: KeyboardEvent) => {
      if (e.code !== PAN_KEY || e.repeat) return;
      if (spaceIsTaken(e.target)) return;
      // otherwise the page scrolls under the map
      e.preventDefault();
      suspendAll(true);
    };
    const handlePanKeyUp = (e: KeyboardEvent) => {
      if (e.code !== PAN_KEY) return;
      suspendAll(false);
    };
    // a key held while the window loses focus never sends its keyup
    const handleBlur = () => suspendAll(false);

    document.addEventListener("keydown", handlePanKeyDown);
    document.addEventListener("keyup", handlePanKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("keydown", handlePanKeyDown);
      document.removeEventListener("keyup", handlePanKeyUp);
      window.removeEventListener("blur", handleBlur);
      suspendAll(false);
    };
  }, [map]);

  // Escape key exits lasso mode
  const onDeactivateRef = useRef(onDeactivate);
  onDeactivateRef.current = onDeactivate;
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // a line being clicked together is what Escape drops first; only with
      // nothing half-drawn does it leave the mode
      const manager = managerRef.current;
      if (manager?.hasLineInProgress()) {
        manager.cancelLine();
        return;
      }
      onDeactivateRef.current?.();
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
        (passiveManagerRef.current?.isDrawing() ?? false) ||
        (refineManagerRef.current?.isDrawing() ?? false);
      setIsDrawing((prev) => (prev !== drawing ? drawing : prev));
    };

    canvas.addEventListener("mousedown", updateDrawing);
    canvas.addEventListener("mouseup", updateDrawing);

    return () => {
      canvas.removeEventListener("mousedown", updateDrawing);
      canvas.removeEventListener("mouseup", updateDrawing);
    };
  }, [map]);

  const cancelLine = useCallback(() => {
    managerRef.current?.cancelLine();
  }, []);

  const showLastShape = useCallback(() => {
    managerRef.current?.showLastShape();
  }, []);

  const hideLastShape = useCallback(() => {
    managerRef.current?.hideLastShape();
  }, []);

  const applyLastShape = useCallback(() => {
    managerRef.current?.applyLastShape();
  }, []);

  return {
    isDrawing,
    cancelLine,
    showLastShape,
    hideLastShape,
    applyLastShape,
  };
};
