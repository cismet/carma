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

const SOURCE_ID = "__carma-lasso-source";
const LINE_LAYER_ID = "__carma-lasso-line";
const FILL_LAYER_ID = "__carma-lasso-fill";

/** Minimum screen-pixel distance between consecutive recorded points. */
const MIN_PX_DISTANCE = 3;

export interface LassoDrawingManagerOptions {
  map: MaplibreMap;
  onDrawComplete: (polygon: Polygon) => void;
  onDrawCancel: () => void;
  /** Minimum points required to form a polygon. Default: 3 */
  minPoints?: number;
}

export class LassoDrawingManager {
  private map: MaplibreMap;
  private onDrawComplete: (polygon: Polygon) => void;
  private onDrawCancel: () => void;
  private minPoints: number;

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
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.ensureSourceAndLayers();
    this.map.getCanvas().style.cursor = "crosshair";
    this.map.on("mousedown", this.handleMouseDown);
  }

  deactivate(): void {
    if (!this.active) return;
    if (this.drawing) {
      this.cancelDraw();
    }
    this.active = false;
    this.map.getCanvas().style.cursor = "";
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

    e.preventDefault();
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

    // Close the ring: connect last point to first
    const ring = [...this.coords, this.coords[0]];
    const polygon: Polygon = {
      type: "Polygon",
      coordinates: [ring],
    };

    this.clearVisual();
    this.onDrawComplete(polygon);
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
        "line-width": 2,
        "line-dasharray": [4, 4],
      },
    });
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

    // If enough points, show the polygon fill (preview of the closed shape)
    if (this.coords.length >= this.minPoints) {
      const ring = [...this.coords, this.coords[0]];
      const poly: Feature<Polygon> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      };
      features.push(poly);
    }

    source.setData({ type: "FeatureCollection", features });
  }

  private clearVisual(): void {
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "FeatureCollection", features: [] });
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
