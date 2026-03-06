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

export interface LassoDrawingManagerOptions {
  map: MaplibreMap;
  onDrawComplete: (polygon: Polygon) => void;
  onDrawCancel: () => void;
  /** Minimum points required to form a polygon. Default: 3 */
  minPoints?: number;
  /** When set, only start drawing if this modifier key is held. No cursor change. */
  requireModifier?: ModifierKey | null;
}

export class LassoDrawingManager {
  private map: MaplibreMap;
  private onDrawComplete: (polygon: Polygon) => void;
  private onDrawCancel: () => void;
  private minPoints: number;
  private requireModifier: ModifierKey | null;

  private active = false;
  private drawing = false;
  private coords: Position[] = [];
  private lastScreenX = 0;
  private lastScreenY = 0;

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
