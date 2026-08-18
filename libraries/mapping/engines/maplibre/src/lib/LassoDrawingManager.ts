/**
 * LassoDrawingManager - React-agnostic selection-shape drawing on a MapLibre map.
 *
 * Two shapes, both ending in the same `onDrawComplete(polygon)`:
 *
 * - `"lasso"`: the user holds the mouse button and draws freely (like a pen).
 *   On mouseup the shape auto-closes (first point connected to last).
 * - `"circle"`: mousedown places the centre, the drag sets the radius in real
 *   ground metres. A plain click (no drag) uses the configured radius, so the
 *   very same circle can be placed again somewhere else — that repeatability is
 *   the whole point of the shape.
 *
 * Visual feedback: dashed blue outline + translucent blue fill updated in
 * real-time via a GeoJSON source while the user draws. The circle additionally
 * shows its radius in a small label at the cursor, drawn as plain DOM so a drag
 * never re-renders the React tree around the map.
 */

import type {
  Map as MaplibreMap,
  GeoJSONSource,
  MapMouseEvent,
} from "maplibre-gl";
import type { Position, Polygon, Feature, LineString } from "geojson";
import {
  unkinkPolygon,
  union,
  featureCollection,
  circle as turfCircle,
  distance as turfDistance,
} from "@turf/turf";

const SOURCE_ID = "__carma-lasso-source";
const LINE_LAYER_ID = "__carma-lasso-line";
const FILL_LAYER_ID = "__carma-lasso-fill";

/** Minimum screen-pixel distance between consecutive recorded points. */
const MIN_PX_DISTANCE = 3;

/** Vertices of a drawn circle; 64 is round enough at any zoom. */
const CIRCLE_STEPS = 64;
/** Below this drag distance the gesture counts as a click, not as a resize. */
const CLICK_PX_TOLERANCE = 4;

export const DEFAULT_CIRCLE_RADIUS = 250;
export const DEFAULT_CIRCLE_RADIUS_STEP = 5;

export type ModifierKey = "alt" | "ctrl" | "shift" | "meta";

/** How the selection area is drawn. */
export type DrawShape = "lasso" | "circle";

export interface LassoDrawingManagerOptions {
  map: MaplibreMap;
  onDrawComplete: (polygon: Polygon) => void;
  onDrawCancel: () => void;
  /** Minimum points required to form a polygon. Default: 3 */
  minPoints?: number;
  /** When set, only start drawing if this modifier key is held. No cursor change. */
  requireModifier?: ModifierKey | null;
  /** Shape drawn on a drag. Default: "lasso" */
  shape?: DrawShape;
  /** Radius in metres used when the circle is placed by a click. Default: 250 */
  circleRadius?: number;
  /** Dragged radii snap to a multiple of this, in metres. Default: 5 */
  radiusStep?: number;
  /** Reports the radius a drag settled on, so the UI can show the new value. */
  onRadiusChange?: (radiusMeters: number) => void;
}

export class LassoDrawingManager {
  private map: MaplibreMap;
  private onDrawComplete: (polygon: Polygon) => void;
  private onDrawCancel: () => void;
  private minPoints: number;
  private requireModifier: ModifierKey | null;

  private shape: DrawShape;
  private circleRadius: number;
  private radiusStep: number;
  private onRadiusChange?: (radiusMeters: number) => void;

  private active = false;
  private drawing = false;
  private coords: Position[] = [];
  private lastScreenX = 0;
  private lastScreenY = 0;

  /** circle only: centre, whether the drag left the click tolerance, current radius */
  private center: Position | null = null;
  private dragged = false;
  private currentRadius = 0;
  private startScreenX = 0;
  private startScreenY = 0;
  private labelEl: HTMLDivElement | null = null;

  // Bound handlers for clean add/remove
  private handleMouseDown = (e: MapMouseEvent) => this.onMouseDown(e);
  private handleMouseMove = (e: MapMouseEvent) => this.onMouseMove(e);
  private handleDocumentMouseUp = () => this.onMouseUp();

  constructor(options: LassoDrawingManagerOptions) {
    this.map = options.map;
    this.onDrawComplete = options.onDrawComplete;
    this.onDrawCancel = options.onDrawCancel;
    this.minPoints = options.minPoints ?? 3;
    this.requireModifier = options.requireModifier ?? null;
    this.shape = options.shape ?? "lasso";
    this.circleRadius = options.circleRadius ?? DEFAULT_CIRCLE_RADIUS;
    this.radiusStep = options.radiusStep ?? DEFAULT_CIRCLE_RADIUS_STEP;
    this.onRadiusChange = options.onRadiusChange;
  }

  /**
   * Switched from the toolbar while the manager stays alive — recreating it
   * would tear down and rebuild the source and its layers on every change.
   */
  setShape(shape: DrawShape): void {
    if (shape === this.shape) return;
    if (this.drawing) this.cancelDraw();
    this.shape = shape;
  }

  setCircleRadius(radiusMeters: number): void {
    this.circleRadius = radiusMeters;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;

    // Always register the mousedown handler immediately so drawing works
    // even if the style/source is still loading (e.g. after clearVisual).
    if (!this.requireModifier) {
      this.map.getCanvas().style.cursor = "crosshair";
    }
    this.map.on("mousedown", this.handleMouseDown);

    if (this.map.isStyleLoaded()) {
      this.ensureSourceAndLayers();
    } else {
      // Style not ready yet (e.g. first load); defer source/layer setup
      this.map.once("load", () => {
        if (this.active) this.ensureSourceAndLayers();
      });
    }
  }

  deactivate(): void {
    if (!this.active) return;
    if (this.drawing) {
      this.cancelDraw();
    }
    this.active = false;
    if (!this.requireModifier) {
      this.map.getCanvas().style.cursor = "";
    }
    this.map.off("mousedown", this.handleMouseDown);
    this.clearVisual();
  }

  destroy(): void {
    this.deactivate();
    this.hideLabel();
    this.removeSourceAndLayers();
  }

  isDrawing(): boolean {
    return this.drawing;
  }

  // ---------------------------------------------------------------------------
  // Drawing lifecycle
  // ---------------------------------------------------------------------------

  private onMouseDown(e: MapMouseEvent): void {
    // Only left button
    if (e.originalEvent.button !== 0) return;

    // If a modifier key is required, check it before starting the draw
    if (this.requireModifier) {
      const orig = e.originalEvent;
      const held =
        (this.requireModifier === "alt" && orig.altKey) ||
        (this.requireModifier === "ctrl" && orig.ctrlKey) ||
        (this.requireModifier === "shift" && orig.shiftKey) ||
        (this.requireModifier === "meta" && orig.metaKey);
      if (!held) return;
    }

    e.preventDefault();
    // Lazy-init source/layers in case activate() deferred them
    this.ensureSourceAndLayers();
    // Ensure lasso layers render on top of all other layers (imperative
    // background/data layers may have been added after the lasso layers).
    this.moveLayersToTop();
    this.drawing = true;
    this.coords = [[e.lngLat.lng, e.lngLat.lat]];
    this.lastScreenX = e.originalEvent.clientX;
    this.lastScreenY = e.originalEvent.clientY;
    this.startScreenX = e.originalEvent.clientX;
    this.startScreenY = e.originalEvent.clientY;

    if (this.shape === "circle") {
      // mousedown places the centre; until the pointer leaves the click
      // tolerance the configured radius is previewed, so a plain click drops
      // exactly that circle
      this.center = [e.lngLat.lng, e.lngLat.lat];
      this.dragged = false;
      this.currentRadius = this.circleRadius;
      this.showLabel(e);
    }

    // Disable map panning while drawing
    this.map.dragPan.disable();

    this.map.on("mousemove", this.handleMouseMove);
    // Use document-level mouseup so we catch release even outside the canvas
    document.addEventListener("mouseup", this.handleDocumentMouseUp, {
      once: true,
    });

    this.updateVisual();
  }

  private onMouseMove(e: MapMouseEvent): void {
    if (!this.drawing) return;

    if (this.shape === "circle") {
      this.onCircleMouseMove(e);
      return;
    }

    // Skip if too close to last recorded point (avoids excessive density)
    const dx = e.originalEvent.clientX - this.lastScreenX;
    const dy = e.originalEvent.clientY - this.lastScreenY;
    if (dx * dx + dy * dy < MIN_PX_DISTANCE * MIN_PX_DISTANCE) return;

    this.lastScreenX = e.originalEvent.clientX;
    this.lastScreenY = e.originalEvent.clientY;
    this.coords.push([e.lngLat.lng, e.lngLat.lat]);

    this.updateVisual();
  }

  /** Radius from the ground distance centre -> cursor, snapped to `radiusStep`. */
  private onCircleMouseMove(e: MapMouseEvent): void {
    if (!this.center) return;

    const dx = e.originalEvent.clientX - this.startScreenX;
    const dy = e.originalEvent.clientY - this.startScreenY;
    if (dx * dx + dy * dy < CLICK_PX_TOLERANCE * CLICK_PX_TOLERANCE) {
      // still within the click tolerance: keep previewing the configured radius
      this.updateLabel(e);
      this.updateVisual();
      return;
    }

    this.dragged = true;
    const meters = turfDistance(this.center, [e.lngLat.lng, e.lngLat.lat], {
      units: "meters",
    });
    this.currentRadius = this.snapRadius(meters);

    this.updateLabel(e);
    this.updateVisual();
  }

  private snapRadius(meters: number): number {
    const step = this.radiusStep > 0 ? this.radiusStep : 1;
    return Math.max(step, Math.round(meters / step) * step);
  }

  private onMouseUp(): void {
    if (!this.drawing) return;
    this.drawing = false;

    this.map.off("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.map.dragPan.enable();
    this.hideLabel();

    if (this.shape === "circle") {
      const center = this.center;
      this.center = null;
      if (!center) {
        this.cancelDraw();
        return;
      }
      const radius = this.dragged ? this.currentRadius : this.circleRadius;
      const polygon = this.buildCircle(center, radius);
      this.clearVisual();
      // a drag defines the new working radius; the next click repeats it
      if (this.dragged) {
        this.circleRadius = radius;
        this.onRadiusChange?.(radius);
      }
      this.onDrawComplete(polygon);
      return;
    }

    if (this.coords.length < this.minPoints) {
      this.cancelDraw();
      return;
    }

    const hull = this.cleanPolygon(this.coords);
    if (!hull) {
      this.cancelDraw();
      return;
    }

    this.clearVisual();
    this.onDrawComplete(hull);
  }

  private cancelDraw(): void {
    this.drawing = false;
    this.coords = [];
    this.center = null;
    this.dragged = false;
    this.map.off("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.map.dragPan.enable();
    this.hideLabel();
    this.clearVisual();
    this.onDrawCancel();
  }

  /**
   * A circle of `radius` ground metres. Real metres rather than screen pixels:
   * the same number has to describe the same area anywhere on the map, which is
   * what makes the shape repeatable.
   */
  private buildCircle(center: Position, radius: number): Polygon {
    return turfCircle(center, radius, {
      steps: CIRCLE_STEPS,
      units: "meters",
    }).geometry;
  }

  // ---------------------------------------------------------------------------
  // Radius label (plain DOM: a drag must not re-render the React tree)
  // ---------------------------------------------------------------------------

  private showLabel(e: MapMouseEvent): void {
    if (!this.labelEl) {
      const el = document.createElement("div");
      el.style.cssText = [
        "position:absolute",
        "z-index:10",
        "pointer-events:none",
        "padding:2px 6px",
        "border-radius:4px",
        "background:rgba(255,255,255,0.9)",
        "border:1px solid #3388ff",
        "color:#333",
        "font-size:12px",
        "line-height:16px",
        "white-space:nowrap",
      ].join(";");
      this.map.getContainer().appendChild(el);
      this.labelEl = el;
    }
    this.updateLabel(e);
  }

  private updateLabel(e: MapMouseEvent): void {
    const el = this.labelEl;
    if (!el) return;
    el.style.left = `${e.point.x + 12}px`;
    el.style.top = `${e.point.y + 12}px`;
    el.textContent = `r = ${Math.round(this.currentRadius)} m`;
  }

  private hideLabel(): void {
    this.labelEl?.remove();
    this.labelEl = null;
  }

  // ---------------------------------------------------------------------------
  // GeoJSON visual feedback
  // ---------------------------------------------------------------------------

  private ensureSourceAndLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;

    this.map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    this.map.addLayer({
      id: FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      filter: ["==", "$type", "Polygon"],
      paint: {
        "fill-color": "#3388ff",
        "fill-opacity": 0.1,
      },
    });

    this.map.addLayer({
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": "#3388ff",
        "line-width": 1.5,
      },
    });
  }

  /** Fix self-intersecting polygon by splitting into simple parts and merging. */
  private cleanPolygon(coords: Position[]): Polygon | null {
    if (coords.length < 3) return null;
    const ring = [...coords, coords[0]];
    const raw: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    };
    try {
      const parts = unkinkPolygon(raw);
      if (parts.features.length === 0) return null;
      if (parts.features.length === 1) return parts.features[0].geometry;
      const merged = union(featureCollection(parts.features));
      if (!merged || merged.geometry.type === "MultiPolygon") {
        // MultiPolygon can happen with disjoint parts; use first polygon
        return merged?.geometry.type === "MultiPolygon"
          ? { type: "Polygon", coordinates: merged.geometry.coordinates[0] }
          : null;
      }
      return merged.geometry;
    } catch {
      // Fallback: return raw polygon as-is
      return { type: "Polygon", coordinates: [ring] };
    }
  }

  private updateVisual(): void {
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    if (this.shape === "circle") {
      if (!this.center) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: this.buildCircle(this.center, this.currentRadius),
          },
        ],
      });
      return;
    }

    if (this.coords.length < 2) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const features: Feature[] = [];

    // Line showing the drawn path
    const line: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: this.coords,
      },
    };
    features.push(line);

    // Show cleaned polygon fill preview
    const hull = this.cleanPolygon(this.coords);
    if (hull) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: hull,
      });
    }

    source.setData({ type: "FeatureCollection", features });
  }

  private clearVisual(): void {
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }

  /** Move lasso layers to the very top of the layer stack. */
  private moveLayersToTop(): void {
    try {
      if (this.map.getLayer(FILL_LAYER_ID)) this.map.moveLayer(FILL_LAYER_ID);
      if (this.map.getLayer(LINE_LAYER_ID)) this.map.moveLayer(LINE_LAYER_ID);
    } catch {
      // ignore if layers don't exist yet
    }
  }

  private removeSourceAndLayers(): void {
    try {
      if (this.map.getLayer(LINE_LAYER_ID)) {
        this.map.removeLayer(LINE_LAYER_ID);
      }
      if (this.map.getLayer(FILL_LAYER_ID)) {
        this.map.removeLayer(FILL_LAYER_ID);
      }
      if (this.map.getSource(SOURCE_ID)) {
        this.map.removeSource(SOURCE_ID);
      }
    } catch {
      // Map may already be destroyed
    }
  }
}
