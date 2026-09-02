import type { Positions } from "@carma-mapping/map-controls-layout";

import type { AnnotationShape } from "./shape-tools";

export type AnnotationAnchor = { lng: number; lat: number; zoom: number };

export type AnnotationGroup = {
  id: string;
  locked: boolean;
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
  shape?: AnnotationShape;
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
