/**
 * LassoDrawingManager - React-agnostic selection-shape drawing on a MapLibre map.
 *
 * Four shapes, all ending in the same `onDrawComplete(polygon)`:
 *
 * - `"lasso"`: the user holds the mouse button and draws freely (like a pen).
 *   On mouseup the shape auto-closes (first point connected to last).
 * - `"circle"`: mousedown places the centre, the drag sets the radius in real
 *   ground metres.
 * - `"rect"`: the drag spans corner to corner, width and height again in real
 *   ground metres. The edges follow parallels and meridians, so the rectangle
 *   covers the same ground area wherever it is placed; a screen-aligned one
 *   would change with the map's rotation and stop being repeatable.
 * - `"line"`: click per vertex ("Linienzug"), so a path with as many points as
 *   the user wants can follow a street exactly; a drag still pans the map.
 *   Double-click or Enter finishes it. A line covers no area, so what it hands
 *   over is the line itself, which selects every feature it crosses — enough
 *   for parcels, buildings and other areas. With `lineBuffer` above 0 it hands
 *   over the corridor that many metres to either side instead, which is what
 *   point features need, since a point never sits exactly on a line.
 *
 * Whatever shape was drawn last stays remembered, so it can be shown again and
 * run a second time without redrawing it. A remembered line keeps its points,
 * not just its corridor, so running it again honours the current width.
 *
 * For circle and rect a plain click (no drag) places the configured size,
 * centred on the clicked point, so the very same area can be placed again
 * somewhere else — that repeatability is the whole point of the two shapes.
 * The exception is a manager with `requireModifier`, where the modifier click
 * already means "toggle this feature"; there only a drag draws.
 *
 * The drag shapes disable panning for as long as the button is held, since the
 * drag itself is the gesture. `setSuspended` hands the drag back to the map, so
 * a consumer can offer a hold-to-pan key for a shape larger than the view.
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
  buffer as turfBuffer,
  area as turfArea,
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
const POINT_LAYER_ID = `${LASSO_LAYER_ID_PREFIX}-point`;
const BUFFER_LINE_LAYER_ID = `${LASSO_LAYER_ID_PREFIX}-buffer-line`;

/**
 * Which half of a buffered shape a feature is. With a width set, both are on
 * the map: the shape as drawn keeps the solid outline it always had, and the
 * area it grew to is drawn dashed around it, so the two never read as one.
 * Features without a role are an ordinary unbuffered shape.
 */
const ROLE_BASE = "base";
const ROLE_BUFFER = "buffer";

/** Minimum screen-pixel distance between consecutive recorded points. */
const MIN_PX_DISTANCE = 3;

/** Vertices of a drawn circle; 64 is round enough at any zoom. */
const CIRCLE_STEPS = 64;
/** Below this drag distance the gesture counts as a click, not as a resize. */
const CLICK_PX_TOLERANCE = 4;
/** Halvings spent narrowing down how far a shape can shrink; eight land within
 *  a percent of it, for eight turf calls. */
const SHRINK_LIMIT_STEPS = 8;

export const DEFAULT_CIRCLE_RADIUS = 250;
export const DEFAULT_CIRCLE_RADIUS_STEP = 5;
export const DEFAULT_RECT_WIDTH = 250;
export const DEFAULT_RECT_HEIGHT = 250;
/** Metres every drawn shape grows by before it selects; 0 selects with the
 *  shape exactly as it was drawn. */
export const DEFAULT_SHAPE_BUFFER = 0;
/** How long a finished shape stays on the map, in ms. 0: wiped at once. */
export const DEFAULT_CLEAR_DELAY = 0;

export type ModifierKey = "alt" | "ctrl" | "shift" | "meta";

const ALL_MODIFIERS: ModifierKey[] = ["alt", "ctrl", "shift", "meta"];

export const DEFAULT_COLOR = "#3388ff";

/** How the selection area is drawn. */
export type DrawShape = "lasso" | "circle" | "rect" | "line";

/** Ground size of the rectangle, in metres. */
export interface RectSize {
  width: number;
  height: number;
}

export interface LassoDrawingManagerOptions {
  map: MaplibreMap;
  /** The drawn selection shape: a polygon, or the bare line of the line tool. */
  onDrawComplete: (shape: Polygon | LineString) => void;
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
  /**
   * Metres every drawn shape grows by before it selects. 0 hands the shape over
   * exactly as drawn, which for the line means the bare line: exact for areas,
   * but it misses point features, which is what a width is for. Default: 0
   */
  shapeBuffer?: number;
  /**
   * Metres of `shapeBuffer` the remembered shape has already been run with,
   * drawn as the solid inner outline. Only affects what is drawn; the width
   * that selects is `shapeBuffer`. Default: 0
   */
  baseBuffer?: number;
  /**
   * Milliseconds the finished shape stays on the map before it is wiped, so
   * what was just selected can be seen against it. 0 wipes it at once.
   * Default: 0
   */
  clearDelay?: number;
  /** Reports a shape that can be shown and run again. `replayed`: the
   *  remembered shape ran again, rather than a new one being drawn.
   *  `bufferMeters`: the width the run just used, which only the manager can
   *  say for sure — a consumer reading it back off its own state would race
   *  with the preview being taken down. */
  onLastShapeChange?: (
    hasLastShape: boolean,
    replayed: boolean,
    bufferMeters: number
  ) => void;
  /** Reports whether the last shape is currently shown on the map. */
  onLastShapePreviewChange?: (previewing: boolean) => void;
  /** Reports a previewed shape that a negative width has shrunk to nothing.
   *  It would select nothing, so the UI can refuse to run it. */
  onShapeEmptyChange?: (empty: boolean) => void;
  /** Reports the deepest shrink the remembered shape survives, as a negative
   *  width. 0 when there is no shape, or when it is a line. */
  onShrinkLimitChange?: (meters: number) => void;
  /** Reports the radius a drag settled on, so the UI can show the new value. */
  onRadiusChange?: (radiusMeters: number) => void;
  /** Reports the size a rectangle drag settled on. */
  onRectSizeChange?: (size: RectSize) => void;
}

export class LassoDrawingManager {
  /** see `clearVisualDelayed`: one pending wipe per map, not per manager */
  private static pendingClears = new WeakMap<
    MaplibreMap,
    ReturnType<typeof setTimeout>
  >();

  private map: MaplibreMap;
  private onDrawComplete: (shape: Polygon | LineString) => void;
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
  private shapeBuffer: number;
  private baseBuffer: number;
  private shapeEmpty = false;
  private shrinkLimit = 0;
  private clearDelay: number;
  private onLastShapeChange?: (
    hasLastShape: boolean,
    replayed: boolean,
    bufferMeters: number
  ) => void;
  private onLastShapePreviewChange?: (previewing: boolean) => void;
  private onShapeEmptyChange?: (empty: boolean) => void;
  private onShrinkLimitChange?: (meters: number) => void;
  private onRadiusChange?: (radiusMeters: number) => void;
  private onRectSizeChange?: (size: RectSize) => void;

  private active = false;
  private drawing = false;
  /** the map owns the drag for now; see `setSuspended` */
  private suspended = false;
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

  /** line: the vertices placed so far and the rubber-band end following the
   *  cursor */
  private linePoints: Position[] = [];
  private lineCursor: Position | null = null;
  private placingLine = false;
  /** the shape last finished, kept so it can be shown and run again. `line`
   *  is set only for the line tool, whose corridor is rebuilt at the width
   *  that is current when it runs again. */
  private lastShape: Polygon | LineString | null = null;
  private previewingLastShape = false;
  private lineDownX = 0;
  private lineDownY = 0;
  private lineDownLngLat: Position | null = null;
  private doubleClickZoomSuspended = false;

  // Bound handlers for clean add/remove
  private handleMouseDown = (e: MapMouseEvent) => this.onMouseDown(e);
  private handleMouseMove = (e: MapMouseEvent) => this.onMouseMove(e);
  private handleDocumentMouseUp = () => this.onMouseUp();
  private handleCaptureMouseDown = (e: MouseEvent) =>
    this.onCaptureMouseDown(e);
  private handleRestoreBoxZoom = () => this.restoreBoxZoom();
  private handleLineMouseMove = (e: MapMouseEvent) => this.onLineMouseMove(e);
  private handleLineMouseUp = (e: MouseEvent) => this.onLineMouseUp(e);
  private handleLineDoubleClick = (e: MapMouseEvent) => {
    e.preventDefault();
    this.finishLine();
  };
  private handleLineKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") this.finishLine();
  };

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
    this.shapeBuffer = options.shapeBuffer ?? DEFAULT_SHAPE_BUFFER;
    this.baseBuffer = options.baseBuffer ?? 0;
    this.clearDelay = options.clearDelay ?? DEFAULT_CLEAR_DELAY;
    this.onLastShapeChange = options.onLastShapeChange;
    this.onLastShapePreviewChange = options.onLastShapePreviewChange;
    this.onShapeEmptyChange = options.onShapeEmptyChange;
    this.onShrinkLimitChange = options.onShrinkLimitChange;
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
    // a line half-placed or waiting for its buffer belongs to the line tool
    this.cancelLine();
    this.shape = shape;
  }

  /**
   * While suspended the manager ignores mousedown entirely, so the drag reaches
   * MapLibre and pans the map instead of drawing. Meant for a hold-to-pan key:
   * a lasso along a street can easily be longer than the current view, and the
   * drag shapes switch `dragPan` off for the whole gesture.
   *
   * A drag already in progress keeps the mouse — the shape half drawn on screen
   * must not vanish under the user's hand. Placing a line is not a drag, so
   * there the key takes over right away.
   */
  setSuspended(suspended: boolean): void {
    if (suspended === this.suspended) return;
    if (suspended && this.drawing && !this.placingLine) return;
    this.suspended = suspended;
    this.applyCursor();
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  /** Only the manager without a modifier owns the cursor: the others share the
   *  map with whatever is drawn without them. */
  private applyCursor(): void {
    if (!this.active || this.requireModifiers.length > 0) return;
    this.map.getCanvas().style.cursor = this.suspended ? "grab" : "crosshair";
  }

  /** Repaints the shared layers, so one manager can serve several operations. */
  setColor(color: string): void {
    if (color === this.color) return;
    this.color = color;
    this.applyColor();
  }

  setCircleRadius(radiusMeters: number): void {
    this.circleRadius = radiusMeters;
  }

  setRectSize(size: RectSize): void {
    this.rectSize = size;
  }

  /** Redraws what is on screen, so the width is seen where it will apply. */
  setShapeBuffer(meters: number): void {
    if (meters === this.shapeBuffer) return;
    this.shapeBuffer = meters;
    if (this.placingLine) this.updateVisual();
    else if (this.previewingLastShape) this.renderLastShape();
  }

  /** Drawing only, so it redraws the same way a width change does. */
  setBaseBuffer(meters: number): void {
    if (meters === this.baseBuffer) return;
    this.baseBuffer = meters;
    if (this.placingLine) this.updateVisual();
    else if (this.previewingLastShape) this.renderLastShape();
  }

  /** What the solid inner outline is drawn at. Deliberately not clamped to
   *  `shapeBuffer`: a shrink puts the dashed outline inside the solid one. */
  private baseWidth(): number {
    if (this.shapeBuffer === 0) return 0;
    return this.baseBuffer;
  }

  private setShapeEmpty(empty: boolean): void {
    if (empty === this.shapeEmpty) return;
    this.shapeEmpty = empty;
    this.onShapeEmptyChange?.(empty);
  }

  private setShrinkLimit(meters: number): void {
    if (meters === this.shrinkLimit) return;
    this.shrinkLimit = meters;
    this.onShrinkLimitChange?.(meters);
  }

  /**
   * The deepest shrink the shape survives, as a negative width.
   *
   * There is no formula for it, so it is searched for by halving. The search
   * starts at half the shorter side of the bounding box: a shape fits inside
   * its box and can never survive more than that.
   */
  private computeShrinkLimit(shape: Polygon | LineString): number {
    if (shape.type === "LineString") return 0;
    const ring = shape.coordinates[0];
    if (!ring || ring.length < 3) return 0;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    let span = 0;
    try {
      span = Math.min(
        turfDistance([minX, midY], [maxX, midY], { units: "meters" }),
        turfDistance([midX, minY], [midX, maxY], { units: "meters" })
      );
    } catch {
      return 0;
    }
    if (!Number.isFinite(span) || span <= 0) return 0;

    let dead = -span / 2;
    if (this.withBuffer(shape, dead) !== null) return Math.ceil(dead);
    let alive = 0;
    for (let step = 0; step < SHRINK_LIMIT_STEPS; step++) {
      const mid = (alive + dead) / 2;
      if (this.withBuffer(shape, mid) === null) dead = mid;
      else alive = mid;
    }
    // ceil on a negative rounds towards zero, so the width handed out is one
    // that was tested and works
    return Math.ceil(alive);
  }

  setClearDelay(ms: number): void {
    this.clearDelay = ms;
  }

  hasLastShape(): boolean {
    return this.lastShape !== null;
  }

  /**
   * Puts the last finished shape back on the map, so it can be judged against
   * the features it will select. A remembered line is drawn with its vertices
   * and the corridor at the width that is current now. Draws nothing while a
   * new line is being placed — that one owns the screen.
   */
  showLastShape(): void {
    if (!this.lastShape || this.placingLine) return;
    this.setPreviewing(true);
    this.renderLastShape();
  }

  /** The preview is the manager's own state, so every place that drops it —
   *  a new draw, a wipe, running it — reports the same truth to the UI. */
  private setPreviewing(previewing: boolean): void {
    if (previewing === this.previewingLastShape) return;
    this.previewingLastShape = previewing;
    if (!previewing) this.setShapeEmpty(false);
    this.onLastShapePreviewChange?.(previewing);
  }

  private renderLastShape(): void {
    const last = this.lastShape;
    if (!last) return;
    this.cancelPendingClear();
    this.ensureSourceAndLayers();
    this.applyColor();
    this.moveLayersToTop();
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    if (last.type === "LineString") {
      // a line can only grow, so a preview of one is never empty
      this.setShapeEmpty(false);
      this.renderLine(source, last.coordinates, null);
      return;
    }
    const buffered = this.withBuffer(last);
    this.setShapeEmpty(buffered === null);
    this.renderShape(last, buffered);
  }

  /** Takes the preview back down; a line being placed is left alone. */
  hideLastShape(): void {
    if (!this.previewingLastShape) return;
    this.setPreviewing(false);
    if (this.placingLine) return;
    this.clearVisual();
  }

  /** Runs the remembered shape again, at the width current now. */
  applyLastShape(): void {
    if (!this.lastShape) return;
    this.setPreviewing(false);
    this.completeShape(this.lastShape, true);
  }

  /**
   * One exit for every tool. What is remembered is the shape as drawn, so a
   * later width change grows it from the original rather than from an already
   * grown one; what is handed over and drawn is the grown version.
   */
  private completeShape(drawn: Polygon | LineString, replayed = false): void {
    const geometry = this.withBuffer(drawn);
    // the limit belongs to the shape, and a replay hands back the same one
    if (drawn !== this.lastShape) {
      this.setShrinkLimit(this.computeShrinkLimit(drawn));
    }
    this.lastShape = drawn;
    this.onLastShapeChange?.(true, replayed, this.shapeBuffer);
    this.renderShape(drawn, geometry);
    this.clearVisualDelayed();
    // a shrink consumed the shape: it covers nothing, so it selects nothing.
    // An empty geometry would instead clear the selection a refine narrows.
    if (geometry) this.onDrawComplete(geometry);
  }

  /**
   * The drawn shape grown by `meters`, `shapeBuffer` by default. Always
   * measured from the shape as drawn, so repeated buffering cannot drift.
   *
   * A negative width shrinks instead. `null` means the shrink left nothing —
   * the caller must not fall back to the shape as drawn, or asking for -100 m
   * would select everything.
   */
  private withBuffer(
    drawn: Polygon | LineString,
    meters: number = this.shapeBuffer
  ): Polygon | LineString | null {
    if (meters === 0) return drawn;
    // a line has no inside to take away
    if (meters < 0 && drawn.type === "LineString") return drawn;
    try {
      const buffered = turfBuffer(
        { type: "Feature", properties: {}, geometry: drawn },
        meters,
        { units: "meters" }
      );
      const geometry = buffered?.geometry;
      if (!geometry) return meters < 0 ? null : drawn;
      if (geometry.type === "Polygon") {
        return geometry.coordinates.length > 0 ? geometry : null;
      }
      // a shrink can pinch a shape into several parts; the largest carries
      // what was drawn
      return this.largestPart(geometry.coordinates);
    } catch {
      return meters < 0 ? null : drawn;
    }
  }

  /** The widest of several polygons, by area. */
  private largestPart(parts: Position[][][]): Polygon | null {
    let best: Polygon | null = null;
    let bestArea = -Infinity;
    for (const coordinates of parts) {
      if (coordinates.length === 0) continue;
      const candidate: Polygon = { type: "Polygon", coordinates };
      let size = 0;
      try {
        size = turfArea({
          type: "Feature",
          properties: {},
          geometry: candidate,
        });
      } catch {
        continue;
      }
      if (size > bestArea) {
        bestArea = size;
        best = candidate;
      }
    }
    return best;
  }

  /** The solid half is the shape at the width it already ran with, so the
   *  dashed half is exactly what an apply would change — outside it when the
   *  width grows, inside it when it shrinks, gone when nothing is left. */
  private renderShape(
    drawn: Polygon | LineString,
    buffered: Polygon | LineString | null
  ): void {
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const base = this.withBuffer(drawn, this.baseWidth());
    if (buffered === drawn && base === drawn) {
      source.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: drawn }],
      });
      return;
    }
    const features: Feature[] = [];
    if (buffered) {
      features.push({
        type: "Feature",
        properties: { role: ROLE_BUFFER },
        geometry: buffered,
      });
    }
    if (base) {
      features.push({
        type: "Feature",
        properties: { role: ROLE_BASE },
        geometry: base,
      });
    }
    source.setData({ type: "FeatureCollection", features });
  }

  /** A line is being clicked together right now. */
  hasLineInProgress(): boolean {
    return this.placingLine;
  }

  /** Drops the line being placed. */
  cancelLine(): void {
    if (!this.placingLine) return;
    this.endLinePlacement();
    this.linePoints = [];
    this.lineCursor = null;
    this.clearVisual();
    this.onDrawCancel();
  }

  activate(): void {
    if (this.active) return;
    this.active = true;

    // Always register the mousedown handler immediately so drawing works
    // even if the style/source is still loading (e.g. after clearVisual).
    this.applyCursor();
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
    this.cancelLine();
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

    // hold-to-pan: the drag belongs to the map for as long as the key is down
    if (this.suspended) return;

    if (!this.modifiersMatch(e.originalEvent)) return;

    // Click-per-vertex is the toolbar's gesture only: on a modifier-driven
    // manager the very same click already toggles the feature under it.
    if (this.shape === "line") {
      if (this.requireModifiers.length === 0) this.onLineMouseDown(e);
      return;
    }

    e.preventDefault();
    // the shape still standing from the last draw belongs to the past now
    this.setPreviewing(false);
    this.baseBuffer = 0;
    this.cancelPendingClear();
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

  // ---------------------------------------------------------------------------
  // Line: click per vertex, finished by double-click or Enter
  // ---------------------------------------------------------------------------

  /**
   * Whether this mousedown becomes a vertex is only known on mouseup: a click
   * places one, a drag pans the map. Panning has to keep working — a line long
   * enough to be worth clicking rarely fits on one screen.
   */
  private onLineMouseDown(e: MapMouseEvent): void {
    this.cancelPendingClear();
    this.ensureSourceAndLayers();
    this.applyColor();
    this.moveLayersToTop();
    this.lineDownX = e.originalEvent.clientX;
    this.lineDownY = e.originalEvent.clientY;
    this.lineDownLngLat = [e.lngLat.lng, e.lngLat.lat];
    document.addEventListener("mouseup", this.handleLineMouseUp, {
      once: true,
    });
  }

  private onLineMouseUp(e: MouseEvent): void {
    const point = this.lineDownLngLat;
    this.lineDownLngLat = null;
    if (!point || !this.active || this.shape !== "line") return;
    const dx = e.clientX - this.lineDownX;
    const dy = e.clientY - this.lineDownY;
    // moved: that was a pan, not a vertex
    if (dx * dx + dy * dy > CLICK_PX_TOLERANCE * CLICK_PX_TOLERANCE) return;
    this.addLineVertex(point);
  }

  private addLineVertex(point: Position): void {
    // the second click of a double-click lands on the previous vertex; taking
    // it would leave a zero-length segment behind after the dblclick finishes
    const last = this.linePoints[this.linePoints.length - 1];
    if (last) {
      const a = this.map.project(last as [number, number]);
      const b = this.map.project(point as [number, number]);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < CLICK_PX_TOLERANCE * CLICK_PX_TOLERANCE) return;
    }

    if (!this.placingLine) this.startLinePlacement();
    this.linePoints.push(point);
    this.lineCursor = point;
    this.updateVisual();
  }

  private startLinePlacement(): void {
    // the new line takes the screen over from a preview of the old one
    this.setPreviewing(false);
    this.baseBuffer = 0;
    this.placingLine = true;
    this.drawing = true;
    this.map.on("mousemove", this.handleLineMouseMove);
    this.map.on("dblclick", this.handleLineDoubleClick);
    document.addEventListener("keydown", this.handleLineKeyDown);
    // the finishing double-click must not zoom the map as well
    if (this.map.doubleClickZoom.isEnabled()) {
      this.map.doubleClickZoom.disable();
      this.doubleClickZoomSuspended = true;
    }
  }

  private endLinePlacement(): void {
    if (!this.placingLine) return;
    this.placingLine = false;
    this.drawing = false;
    this.map.off("mousemove", this.handleLineMouseMove);
    this.map.off("dblclick", this.handleLineDoubleClick);
    document.removeEventListener("keydown", this.handleLineKeyDown);
    if (this.doubleClickZoomSuspended) {
      this.doubleClickZoomSuspended = false;
      this.map.doubleClickZoom.enable();
    }
  }

  private onLineMouseMove(e: MapMouseEvent): void {
    if (!this.placingLine) return;
    this.lineCursor = [e.lngLat.lng, e.lngLat.lat];
    this.updateVisual();
  }

  /**
   * The double-click is the whole gesture: what leaves here is the corridor at
   * the width the buffer button currently holds, not the bare line — with no
   * area of its own a line would select next to nothing.
   */
  private finishLine(): void {
    if (!this.placingLine) return;
    const points = this.linePoints;
    this.endLinePlacement();
    this.lineCursor = null;
    // one last render without the rubber band, so what stands for the delay is
    // the line as it was finished
    this.updateVisual();
    this.linePoints = [];
    if (points.length < 2) {
      this.clearVisual();
      this.onDrawCancel();
      return;
    }
    this.completeShape({ type: "LineString", coordinates: points });
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
      this.completeShape(polygon);
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

    this.completeShape(hull);
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
      // the drawn shape inside a buffer stays unfilled, or the middle would
      // darken where the two overlap
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["!=", ["get", "role"], ROLE_BASE],
      ],
      paint: {
        "fill-color": this.color,
        // maplibre cross-fades paint colors over 300ms by default, so the
        // shared layers would still look orange at the start of a blue draw
        "fill-color-transition": { duration: 0 },
        "fill-opacity": 0.1,
      },
    });

    // the grown area, dashed
    this.map.addLayer({
      id: BUFFER_LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "role"], ROLE_BUFFER],
      paint: {
        "line-color": this.color,
        "line-color-transition": { duration: 0 },
        "line-width": 1.5,
        "line-dasharray": [3, 2],
        "line-opacity": 0.9,
      },
    });

    // the shape as drawn, solid
    this.map.addLayer({
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      filter: ["!=", ["get", "role"], ROLE_BUFFER],
      paint: {
        "line-color": this.color,
        "line-color-transition": { duration: 0 },
        "line-width": 1.5,
      },
    });

    // vertices of a line being clicked together
    this.map.addLayer({
      id: POINT_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#ffffff",
        "circle-stroke-color": this.color,
        "circle-stroke-color-transition": { duration: 0 },
        "circle-stroke-width": 2,
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
      if (this.map.getLayer(BUFFER_LINE_LAYER_ID)) {
        this.map.setPaintProperty(
          BUFFER_LINE_LAYER_ID,
          "line-color",
          this.color
        );
      }
      if (this.map.getLayer(POINT_LAYER_ID)) {
        this.map.setPaintProperty(
          POINT_LAYER_ID,
          "circle-stroke-color",
          this.color
        );
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

    if (this.shape === "line") {
      this.updateLineVisual(source);
      return;
    }

    if (this.shape !== "lasso") {
      if (!this.anchor) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      // buffered while the drag runs, not only once it is let go: the grown
      // area is what selects, so it has to be visible while it is being aimed
      const polygon = this.buildSizedShape(this.anchor);
      this.renderShape(polygon, this.withBuffer(polygon));
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

    // Show cleaned polygon fill preview, grown by the buffer if one is set
    const hull = this.cleanPolygon(this.coords);
    if (hull) {
      const buffered = this.withBuffer(hull);
      const base = this.withBuffer(hull, this.baseWidth());
      if (buffered === hull && base === hull) {
        features.push({ type: "Feature", properties: {}, geometry: hull });
      } else {
        if (buffered) {
          features.push({
            type: "Feature",
            properties: { role: ROLE_BUFFER },
            geometry: buffered,
          });
        }
        if (base) {
          features.push({
            type: "Feature",
            properties: { role: ROLE_BASE },
            geometry: base,
          });
        }
      }
    }

    source.setData({ type: "FeatureCollection", features });
  }

  /** Corridor, line and one dot per placed vertex — the dots are what makes a
   *  many-point line readable while it is being clicked together. */
  private updateLineVisual(source: GeoJSONSource): void {
    this.renderLine(source, this.linePoints, this.lineCursor);
  }

  private renderLine(
    source: GeoJSONSource,
    placed: Position[],
    cursor: Position | null
  ): void {
    if (placed.length === 0) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const path = cursor ? [...placed, cursor] : placed;

    const features: Feature[] = [];
    // only when a width is set; without one the shape IS the line drawn below
    const corridor =
      path.length >= 2
        ? this.withBuffer({ type: "LineString", coordinates: path })
        : null;
    if (corridor?.type === "Polygon") {
      features.push({
        type: "Feature",
        properties: { role: ROLE_BUFFER },
        geometry: corridor,
      });
      // the corridor it already ran with, so the dashed one reads as the step
      // a replay adds; the line and its vertices are drawn on top either way
      const applied =
        this.baseWidth() > 0
          ? this.withBuffer(
              { type: "LineString", coordinates: path },
              this.baseWidth()
            )
          : null;
      if (applied?.type === "Polygon") {
        features.push({
          type: "Feature",
          properties: { role: ROLE_BASE },
          geometry: applied,
        });
      }
    }
    if (path.length >= 2) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: path },
      });
    }
    for (const vertex of placed) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: vertex },
      });
    }
    source.setData({ type: "FeatureCollection", features });
  }

  private clearVisual(): void {
    this.cancelPendingClear();
    this.setPreviewing(false);
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }

  /**
   * Leaves the finished shape standing for `clearDelay`, so it can be seen
   * against the features it just selected.
   *
   * The pending wipe is shared per map, not per manager: the source and its
   * layers are shared too, so a timer started by the toolbar manager would
   * otherwise erase a refine shape someone began drawing meanwhile.
   */
  private clearVisualDelayed(): void {
    if (this.clearDelay <= 0) {
      this.clearVisual();
      return;
    }
    this.cancelPendingClear();
    const timer = setTimeout(() => {
      LassoDrawingManager.pendingClears.delete(this.map);
      this.clearVisual();
    }, this.clearDelay);
    LassoDrawingManager.pendingClears.set(this.map, timer);
  }

  private cancelPendingClear(): void {
    const timer = LassoDrawingManager.pendingClears.get(this.map);
    if (timer === undefined) return;
    clearTimeout(timer);
    LassoDrawingManager.pendingClears.delete(this.map);
  }

  /** Move lasso layers to the very top of the layer stack. */
  private moveLayersToTop(): void {
    try {
      if (this.map.getLayer(FILL_LAYER_ID)) this.map.moveLayer(FILL_LAYER_ID);
      if (this.map.getLayer(BUFFER_LINE_LAYER_ID)) {
        this.map.moveLayer(BUFFER_LINE_LAYER_ID);
      }
      if (this.map.getLayer(LINE_LAYER_ID)) this.map.moveLayer(LINE_LAYER_ID);
      if (this.map.getLayer(POINT_LAYER_ID)) this.map.moveLayer(POINT_LAYER_ID);
    } catch {
      // ignore if layers don't exist yet
    }
  }

  private removeSourceAndLayers(): void {
    try {
      if (this.map.getLayer(POINT_LAYER_ID)) {
        this.map.removeLayer(POINT_LAYER_ID);
      }
      if (this.map.getLayer(LINE_LAYER_ID)) {
        this.map.removeLayer(LINE_LAYER_ID);
      }
      if (this.map.getLayer(BUFFER_LINE_LAYER_ID)) {
        this.map.removeLayer(BUFFER_LINE_LAYER_ID);
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
