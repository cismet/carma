/**
 * LassoDrawingManager - React-agnostic selection-shape drawing on a MapLibre map.
 *
 * Three shapes, all ending in the same `onDrawComplete(polygon)`:
 *
 * - `"lasso"`: the user holds the mouse button and draws freely (like a pen).
 *   On mouseup the shape auto-closes (first point connected to last).
 * - `"circle"`: mousedown places the centre, the drag sets the radius in real
 *   ground metres.
 * - `"rect"`: the drag spans corner to corner, width and height again in real
 *   ground metres. The edges follow parallels and meridians, so the rectangle
 *   covers the same ground area wherever it is placed; a screen-aligned one
 *   would change with the map's rotation and stop being repeatable.
 *
 * For circle and rect a plain click (no drag) places the configured size,
 * centred on the clicked point, so the very same area can be placed again
 * somewhere else — that repeatability is the whole point of the two shapes.
 * The exception is a manager with `requireModifier`, where the modifier click
 * already means "toggle this feature"; there only a drag draws.
 *
 * Visual feedback: dashed blue outline + translucent blue fill updated in
 * real-time via a GeoJSON source while the user draws. Circle and rect
 * additionally show their measurements in a small label at the cursor, drawn as
 * plain DOM so a drag never re-renders the React tree around the map.
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
  destination as turfDestination,
} from "@turf/turf";

/**
 * Shared prefix of the drawing tool's own source and layers. Exported so
 * consumers that walk the style can tell this chrome apart from map content —
 * the highlight addon's dim pass has to skip it, or the shape being drawn is
 * dimmed along with the map it selects from.
 */
export const LASSO_LAYER_ID_PREFIX = "__carma-lasso";

const SOURCE_ID = `${LASSO_LAYER_ID_PREFIX}-source`;
const LINE_LAYER_ID = `${LASSO_LAYER_ID_PREFIX}-line`;
const FILL_LAYER_ID = `${LASSO_LAYER_ID_PREFIX}-fill`;

/** Minimum screen-pixel distance between consecutive recorded points. */
const MIN_PX_DISTANCE = 3;

/** Vertices of a drawn circle; 64 is round enough at any zoom. */
const CIRCLE_STEPS = 64;
/** Below this drag distance the gesture counts as a click, not as a resize. */
const CLICK_PX_TOLERANCE = 4;

export const DEFAULT_CIRCLE_RADIUS = 250;
export const DEFAULT_CIRCLE_RADIUS_STEP = 5;
export const DEFAULT_RECT_WIDTH = 250;
export const DEFAULT_RECT_HEIGHT = 250;

export type ModifierKey = "alt" | "ctrl" | "shift" | "meta";

const ALL_MODIFIERS: ModifierKey[] = ["alt", "ctrl", "shift", "meta"];

const DEFAULT_COLOR = "#3388ff";

/** How the selection area is drawn. */
export type DrawShape = "lasso" | "circle" | "rect";

/** Ground size of the rectangle, in metres. */
export interface RectSize {
  width: number;
  height: number;
}

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
  /**
   * Let a plain click place the configured circle or rectangle even on a
   * modifier-driven manager. Only safe where the modifier click has no other
   * meaning. Default: false.
   */
  allowClickPlacement?: boolean;
  /** Outline + fill color of the drawn shape. Default: blue. */
  color?: string;
  /** Shape drawn on a drag. Default: "lasso" */
  shape?: DrawShape;
  /** Radius in metres used when the circle is placed by a click. Default: 250 */
  circleRadius?: number;
  /** Ground size in metres used when the rectangle is placed by a click. */
  rectSize?: RectSize;
  /** Dragged radii and edge lengths snap to a multiple of this, in metres. Default: 5 */
  radiusStep?: number;
  /** Reports the radius a drag settled on, so the UI can show the new value. */
  onRadiusChange?: (radiusMeters: number) => void;
  /** Reports the size a rectangle drag settled on. */
  onRectSizeChange?: (size: RectSize) => void;
}

export class LassoDrawingManager {
  private map: MaplibreMap;
  private onDrawComplete: (polygon: Polygon) => void;
  private onDrawCancel: () => void;
  private minPoints: number;
  private requireModifiers: ModifierKey[];
  private skipWhenModifiers: ModifierKey[];
  private allowClickPlacement: boolean;
  private color: string;

  private shape: DrawShape;
  private circleRadius: number;
  private rectSize: RectSize;
  private radiusStep: number;
  private onRadiusChange?: (radiusMeters: number) => void;
  private onRectSizeChange?: (size: RectSize) => void;

  private active = false;
  private drawing = false;
  private coords: Position[] = [];
  private lastScreenX = 0;
  private lastScreenY = 0;
  private boxZoomSuspended = false;

  /** circle and rect: the mousedown point, whether the drag left the click
   *  tolerance, and the measurements the gesture currently describes. The
   *  anchor is the centre for a circle and the first corner for a rectangle. */
  private anchor: Position | null = null;
  private dragged = false;
  private currentRadius = 0;
  private currentRect: RectSize = {
    width: DEFAULT_RECT_WIDTH,
    height: DEFAULT_RECT_HEIGHT,
  };
  /** rect only: which way the drag went from the anchor */
  private rectSignX = 1;
  private rectSignY = 1;
  private startScreenX = 0;
  private startScreenY = 0;
  private labelEl: HTMLDivElement | null = null;

  // Bound handlers for clean add/remove
  private handleMouseDown = (e: MapMouseEvent) => this.onMouseDown(e);
  private handleMouseMove = (e: MapMouseEvent) => this.onMouseMove(e);
  private handleDocumentMouseUp = () => this.onMouseUp();
  private handleCaptureMouseDown = (e: MouseEvent) =>
    this.onCaptureMouseDown(e);
  private handleRestoreBoxZoom = () => this.restoreBoxZoom();

  constructor(options: LassoDrawingManagerOptions) {
    this.map = options.map;
    this.onDrawComplete = options.onDrawComplete;
    this.onDrawCancel = options.onDrawCancel;
    this.minPoints = options.minPoints ?? 3;
    const req = options.requireModifier ?? null;
    this.requireModifiers = req == null ? [] : Array.isArray(req) ? req : [req];
    this.skipWhenModifiers = options.skipWhenModifiers ?? [];
    this.allowClickPlacement = options.allowClickPlacement ?? false;
    this.color = options.color ?? DEFAULT_COLOR;
    this.shape = options.shape ?? "lasso";
    this.circleRadius = options.circleRadius ?? DEFAULT_CIRCLE_RADIUS;
    this.rectSize = options.rectSize ?? {
      width: DEFAULT_RECT_WIDTH,
      height: DEFAULT_RECT_HEIGHT,
    };
    this.radiusStep = options.radiusStep ?? DEFAULT_CIRCLE_RADIUS_STEP;
    this.onRadiusChange = options.onRadiusChange;
    this.onRectSizeChange = options.onRectSizeChange;
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

  setRectSize(size: RectSize): void {
    this.rectSize = size;
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
    this.hideLabel();
    this.removeSourceAndLayers();
  }

  isDrawing(): boolean {
    return this.drawing;
  }

  /** Change the excluded combination at runtime — used to hand a modifier over
   *  to another manager only while that one is armed. */
  setSkipWhenModifiers(modifiers: ModifierKey[]): void {
    this.skipWhenModifiers = modifiers;
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
    this.startScreenX = e.originalEvent.clientX;
    this.startScreenY = e.originalEvent.clientY;

    if (this.shape !== "lasso") {
      // mousedown sets the anchor; until the pointer leaves the click tolerance
      // the configured size is previewed, so a plain click drops exactly that
      this.anchor = [e.lngLat.lng, e.lngLat.lat];
      this.dragged = false;
      this.currentRadius = this.circleRadius;
      this.currentRect = this.rectSize;
      this.rectSignX = 1;
      this.rectSignY = 1;
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

    if (this.shape === "circle" || this.shape === "rect") {
      this.onSizedShapeMouseMove(e);
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
  /** Circle radius, or rectangle width and height, from the drag in real metres. */
  private onSizedShapeMouseMove(e: MapMouseEvent): void {
    const anchor = this.anchor;
    if (!anchor) return;

    const dx = e.originalEvent.clientX - this.startScreenX;
    const dy = e.originalEvent.clientY - this.startScreenY;
    if (dx * dx + dy * dy < CLICK_PX_TOLERANCE * CLICK_PX_TOLERANCE) {
      // still within the click tolerance: keep previewing the configured size
      this.updateLabel(e);
      this.updateVisual();
      return;
    }

    this.dragged = true;
    const cursor: Position = [e.lngLat.lng, e.lngLat.lat];

    if (this.shape === "circle") {
      this.currentRadius = this.snapMeters(
        turfDistance(anchor, cursor, { units: "meters" })
      );
    } else {
      // measured along the anchor's parallel and meridian, so width and height
      // are the real ground lengths of the rectangle's own edges
      this.currentRect = {
        width: this.snapMeters(
          turfDistance(anchor, [cursor[0], anchor[1]], { units: "meters" })
        ),
        height: this.snapMeters(
          turfDistance(anchor, [anchor[0], cursor[1]], { units: "meters" })
        ),
      };
      this.rectSignX = cursor[0] >= anchor[0] ? 1 : -1;
      this.rectSignY = cursor[1] >= anchor[1] ? 1 : -1;
    }

    this.updateLabel(e);
    this.updateVisual();
  }

  private snapMeters(meters: number): number {
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

    if (this.shape !== "lasso") {
      const anchor = this.anchor;
      this.anchor = null;
      if (!anchor) {
        this.cancelDraw();
        return;
      }
      // On the modifier-driven manager a plain click is not ours: the same
      // modifier click already toggles the feature under the cursor. Placing a
      // configured circle on top of it would select its whole neighbourhood as
      // well. Only a real drag counts there.
      if (
        !this.dragged &&
        this.requireModifiers.length > 0 &&
        !this.allowClickPlacement
      ) {
        this.cancelDraw();
        return;
      }
      const polygon = this.buildSizedShape(anchor);
      this.clearVisual();
      // a drag defines the new working size; the next click repeats it
      if (this.dragged) {
        if (this.shape === "circle") {
          this.circleRadius = this.currentRadius;
          this.onRadiusChange?.(this.currentRadius);
        } else {
          this.rectSize = this.currentRect;
          this.onRectSizeChange?.(this.currentRect);
        }
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
    this.anchor = null;
    this.dragged = false;
    this.map.off("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.map.dragPan.enable();
    this.hideLabel();
    this.clearVisual();
    this.onDrawCancel();
  }

  /**
   * The circle or rectangle the current gesture describes, in real ground
   * metres rather than screen pixels: the same numbers have to describe the
   * same area anywhere on the map, which is what makes the shapes repeatable.
   *
   * A drag runs from the anchor outwards (centre for the circle, first corner
   * for the rectangle); a click has no direction, so the configured size is
   * centred on the clicked point instead.
   */
  private buildSizedShape(anchor: Position): Polygon {
    if (this.shape === "circle") {
      return this.buildCircle(
        anchor,
        this.dragged ? this.currentRadius : this.circleRadius
      );
    }
    const size = this.dragged ? this.currentRect : this.rectSize;
    if (!this.dragged) {
      // centre the configured rectangle on the click
      const corner = this.offset(anchor, -size.width / 2, -size.height / 2);
      return this.buildRect(corner, size, 1, 1);
    }
    return this.buildRect(anchor, size, this.rectSignX, this.rectSignY);
  }

  private buildCircle(center: Position, radius: number): Polygon {
    return turfCircle(center, radius, {
      steps: CIRCLE_STEPS,
      units: "meters",
    }).geometry;
  }

  /** `east`/`north` metres from `origin`, along its parallel and meridian. */
  private offset(origin: Position, east: number, north: number): Position {
    const alongParallel = turfDestination(
      origin,
      Math.abs(east),
      east >= 0 ? 90 : -90,
      {
        units: "meters",
      }
    );
    const corner = turfDestination(
      alongParallel,
      Math.abs(north),
      north >= 0 ? 0 : 180,
      { units: "meters" }
    );
    return corner.geometry.coordinates;
  }

  /**
   * Axis-aligned in geographic space: the edges follow parallels and meridians,
   * so `width` x `height` metres cover the same ground area wherever the
   * rectangle is placed. A screen-aligned one would turn with the map and stop
   * being repeatable.
   */
  private buildRect(
    corner: Position,
    size: RectSize,
    signX: number,
    signY: number
  ): Polygon {
    const opposite = this.offset(
      corner,
      signX * size.width,
      signY * size.height
    );
    return {
      type: "Polygon",
      coordinates: [
        [
          corner,
          [opposite[0], corner[1]],
          opposite,
          [corner[0], opposite[1]],
          corner,
        ],
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Measurement label (plain DOM: a drag must not re-render the React tree)
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
    el.textContent =
      this.shape === "circle"
        ? `r = ${Math.round(this.currentRadius)} m`
        : `${Math.round(this.currentRect.width)} \u00d7 ${Math.round(
            this.currentRect.height
          )} m`;
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

    if (this.shape !== "lasso") {
      if (!this.anchor) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: this.buildSizedShape(this.anchor),
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
