/**
 * LassoDrawingManager - React-agnostic freehand lasso drawing on a MapLibre map.
 *
 * The user holds the mouse button and draws freely (like a pen). On mouseup
 * the shape auto-closes (first point connected to last) and onDrawComplete
 * fires with the resulting GeoJSON Polygon.
 *
 * Visual feedback: dashed blue outline + translucent blue fill updated in
 * real-time via a GeoJSON source while the user draws.
 */

import type {
  Map as MaplibreMap,
  GeoJSONSource,
  MapMouseEvent,
} from "maplibre-gl";
import type { Position, Polygon, Feature, LineString } from "geojson";
import { unkinkPolygon, union, featureCollection } from "@turf/turf";

const SOURCE_ID = "__carma-lasso-source";
const LINE_LAYER_ID = "__carma-lasso-line";
const FILL_LAYER_ID = "__carma-lasso-fill";

/** Minimum screen-pixel distance between consecutive recorded points. */
const MIN_PX_DISTANCE = 3;

export type ModifierKey = "alt" | "ctrl" | "shift" | "meta";

const ALL_MODIFIERS: ModifierKey[] = ["alt", "ctrl", "shift", "meta"];

const DEFAULT_COLOR = "#3388ff";

export interface LassoDrawingManagerOptions {
  map: MaplibreMap;
  onDrawComplete: (polygon: Polygon) => void;
  onDrawCancel: () => void;
  /** Minimum points required to form a polygon. Default: 3 */
  minPoints?: number;
  /**
   * When set, only start drawing while exactly these modifier keys are held —
   * every listed key down AND every other modifier up. The "others up" half
   * matters as soon as two managers coexist: an "alt" manager must not fire on
   * Alt+Shift, or it would draw alongside the Alt+Shift manager.
   * No cursor change.
   */
  requireModifier?: ModifierKey | ModifierKey[] | null;
  /**
   * Skip the mousedown while ALL of these modifiers are held. For the
   * no-modifier (toolbar) manager, which otherwise starts on any mousedown and
   * would collide with a modifier-driven manager.
   */
  skipWhenModifiers?: ModifierKey[];
  /** Outline + fill color of the drawn shape. Default: blue. */
  color?: string;
}

export class LassoDrawingManager {
  private map: MaplibreMap;
  private onDrawComplete: (polygon: Polygon) => void;
  private onDrawCancel: () => void;
  private minPoints: number;
  private requireModifiers: ModifierKey[];
  private skipWhenModifiers: ModifierKey[];
  private color: string;

  private active = false;
  private drawing = false;
  private coords: Position[] = [];
  private lastScreenX = 0;
  private lastScreenY = 0;
  private boxZoomSuspended = false;

  // Bound handlers for clean add/remove
  private handleMouseDown = (e: MapMouseEvent) => this.onMouseDown(e);
  private handleMouseMove = (e: MapMouseEvent) => this.onMouseMove(e);
  private handleDocumentMouseUp = () => this.onMouseUp();
  private handleCaptureMouseDown = (e: MouseEvent) => this.onCaptureMouseDown(e);
  private handleRestoreBoxZoom = () => this.restoreBoxZoom();

  constructor(options: LassoDrawingManagerOptions) {
    this.map = options.map;
    this.onDrawComplete = options.onDrawComplete;
    this.onDrawCancel = options.onDrawCancel;
    this.minPoints = options.minPoints ?? 3;
    const req = options.requireModifier ?? null;
    this.requireModifiers = req == null ? [] : Array.isArray(req) ? req : [req];
    this.skipWhenModifiers = options.skipWhenModifiers ?? [];
    this.color = options.color ?? DEFAULT_COLOR;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;

    // Always register the mousedown handler immediately so drawing works
    // even if the style/source is still loading (e.g. after clearVisual).
    if (this.requireModifiers.length === 0) {
      this.map.getCanvas().style.cursor = "crosshair";
    }
    this.map.on("mousedown", this.handleMouseDown);

    // Shift+drag is MapLibre's own box zoom, and it ignores the other modifier
    // keys — so an Alt+Shift lasso would zoom as well. Suspend box zoom for the
    // duration of exactly our combination, in the capture phase so we run
    // before MapLibre's handler on the canvas container.
    if (this.requireModifiers.includes("shift")) {
      this.map
        .getCanvasContainer()
        .addEventListener("mousedown", this.handleCaptureMouseDown, true);
    }

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
    if (this.requireModifiers.length === 0) {
      this.map.getCanvas().style.cursor = "";
    }
    this.map.off("mousedown", this.handleMouseDown);
    if (this.requireModifiers.includes("shift")) {
      this.map
        .getCanvasContainer()
        .removeEventListener("mousedown", this.handleCaptureMouseDown, true);
    }
    this.restoreBoxZoom();
    this.clearVisual();
  }

  destroy(): void {
    this.deactivate();
    this.removeSourceAndLayers();
  }

  isDrawing(): boolean {
    return this.drawing;
  }

  // ---------------------------------------------------------------------------
  // Drawing lifecycle
  // ---------------------------------------------------------------------------

  /** Is `key` held in this mouse event? */
  private static isHeld(e: MouseEvent, key: ModifierKey): boolean {
    return key === "alt"
      ? e.altKey
      : key === "ctrl"
      ? e.ctrlKey
      : key === "shift"
      ? e.shiftKey
      : e.metaKey;
  }

  /** Exact modifier match: every required key down, every other one up. */
  private modifiersMatch(e: MouseEvent): boolean {
    if (this.requireModifiers.length === 0) {
      // No requirement: any modifier state goes, except an explicitly excluded
      // combination owned by another manager.
      return (
        this.skipWhenModifiers.length === 0 ||
        !this.skipWhenModifiers.every((k) => LassoDrawingManager.isHeld(e, k))
      );
    }
    return ALL_MODIFIERS.every(
      (k) =>
        LassoDrawingManager.isHeld(e, k) === this.requireModifiers.includes(k)
    );
  }

  /** Capture-phase mousedown: suspend box zoom while our combination is held. */
  private onCaptureMouseDown(e: MouseEvent): void {
    if (!this.active || e.button !== 0) return;
    if (!this.modifiersMatch(e)) return;
    if (this.boxZoomSuspended || !this.map.boxZoom.isEnabled()) return;
    this.boxZoomSuspended = true;
    this.map.boxZoom.disable();
    // Restore even when no draw happens (too few points, click without drag).
    document.addEventListener("mouseup", this.handleRestoreBoxZoom, {
      once: true,
      capture: true,
    });
  }

  private restoreBoxZoom(): void {
    if (!this.boxZoomSuspended) return;
    this.boxZoomSuspended = false;
    document.removeEventListener("mouseup", this.handleRestoreBoxZoom, true);
    this.map.boxZoom.enable();
  }

  private onMouseDown(e: MapMouseEvent): void {
    // Only left button
    if (e.originalEvent.button !== 0) return;

    if (!this.modifiersMatch(e.originalEvent)) return;

    e.preventDefault();
    // Lazy-init source/layers in case activate() deferred them
    this.ensureSourceAndLayers();
    // Source and layers are shared by all managers on this map, so the color
    // belongs to whoever is drawing right now (only one ever is).
    this.applyColor();
    // Ensure lasso layers render on top of all other layers (imperative
    // background/data layers may have been added after the lasso layers).
    this.moveLayersToTop();
    this.drawing = true;
    this.coords = [[e.lngLat.lng, e.lngLat.lat]];
    this.lastScreenX = e.originalEvent.clientX;
    this.lastScreenY = e.originalEvent.clientY;

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

    // Skip if too close to last recorded point (avoids excessive density)
    const dx = e.originalEvent.clientX - this.lastScreenX;
    const dy = e.originalEvent.clientY - this.lastScreenY;
    if (dx * dx + dy * dy < MIN_PX_DISTANCE * MIN_PX_DISTANCE) return;

    this.lastScreenX = e.originalEvent.clientX;
    this.lastScreenY = e.originalEvent.clientY;
    this.coords.push([e.lngLat.lng, e.lngLat.lat]);

    this.updateVisual();
  }

  private onMouseUp(): void {
    if (!this.drawing) return;
    this.drawing = false;

    this.map.off("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.map.dragPan.enable();

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
    this.map.off("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.map.dragPan.enable();
    this.clearVisual();
    this.onDrawCancel();
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
        "fill-color": this.color,
        "fill-opacity": 0.1,
      },
    });

    this.map.addLayer({
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": this.color,
        "line-width": 1.5,
      },
    });
  }

  private applyColor(): void {
    try {
      if (this.map.getLayer(FILL_LAYER_ID)) {
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-color", this.color);
      }
      if (this.map.getLayer(LINE_LAYER_ID)) {
        this.map.setPaintProperty(LINE_LAYER_ID, "line-color", this.color);
      }
    } catch {
      // Layers may not exist yet; they are created with the right color anyway.
    }
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
