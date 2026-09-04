import type { Positions } from "@carma-mapping/map-controls-layout";

import type { AnnotationShape } from "./shape-tools";

export type AnnotationAnchor = { lng: number; lat: number; zoom: number };

/** the map zooms a drawing owns, half open; it renders 100 % at `from` */
export type AnnotationCoverage = { from: number; to: number };

export type AnnotationGroup = {
  id: string;
  locked: boolean;
  /** claimed by the stroke that started the drawing; unset while untouched */
  coverage?: AnnotationCoverage;
};

/** "zoom to this drawing", bumped per request so a repeat still lands */
export type AnnotationZoomRequest = {
  id: string;
  version: number;
};

/** the `annotationMode` channel: whether the sketch layer owns the pointer */
export type AnnotationState = {
  isOn: boolean;
  groups?: AnnotationGroup[];
  activeId?: string;
  /** null: excalidraw runs a tool the toolbar does not carry */
  shape?: AnnotationShape | null;
  undoVersion?: number;
  redoVersion?: number;
  zoomRequest?: AnnotationZoomRequest;
};

/** how far the overlay keeps clear of each edge of the map area, in px */
export type AnnotationInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

/**
 * Where the scene transform stops matching the map. Each one hides the drawing
 * instead of showing it in the wrong place; all off by default, so the drawing
 * stays visible and may sit off its ground position.
 */
export type AnnotationSyncLimits = {
  /** hide while the map is rotated. Default: false */
  rotated?: boolean;
  /** hide while the map is tilted. Default: false */
  tilted?: boolean;
  /** hide outside excalidraw's own zoom clamp. Default: false */
  zoom?: boolean;
};

/**
 * The scale window a drawing is drawn in, in percent — the same number
 * excalidraw shows in its zoom widget. It keeps strokes in shape: never
 * thinner than `min`, never bolder than `max`.
 *
 * A drawing is started at 100 %, so the window has to hold that: `min` at or
 * below it, `max` at or above. It is also how far the drawing reaches on the
 * zoom axis, `log2(min)` levels down and `log2(max)` up — 50–200 is one each
 * way. Drawing at a zoom another drawing already covers joins that one.
 */
export type AnnotationZoomRange = {
  /** the thin end, in percent, at most 100. Default: 50 */
  min?: number;
  /** the bold end, in percent, at least 100. Default: 200 */
  max?: number;
};

export type AnnotationOverlayConfig = {
  /** stacking inside the map wrapper. Default: 500 */
  zIndex?: number;
  /** the app's top bar, measured. Default: "#topNavbar" */
  toolbarSelector?: string;
  /** added to the measured top bar, applied as given to the other edges */
  inset?: AnnotationInset;
  storageKey?: string;
  langCode?: string;
  hideMenu?: boolean;
  hideTools?: boolean;
  hideHelp?: boolean;
  hideLibrary?: boolean;
  hideHistory?: boolean;
  hideWhenOff?: boolean;
  shapeTools?: boolean;
  syncLimits?: AnnotationSyncLimits;
  zoomRange?: AnnotationZoomRange;
  hideZoom?: boolean;
  background?: string;
  backgroundOpacity?: number;
};

export type AnnotationControlConfig = {
  /** Corner the button is registered in. Default: "topleft" */
  position?: Positions;
  /** Sort order within that corner. Default: 90 */
  order?: number;
};
