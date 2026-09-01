import type { Positions } from "@carma-mapping/map-controls-layout";

import type { AnnotationShape } from "./shape-tools";

/** One drawing: its own excalidraw scene, anchored where its scene mounts. */
export type AnnotationGroup = {
  id: string;
  /** locked drawings still follow the camera, they just take no pointer */
  locked: boolean;
};

/** the `annotationMode` channel: whether the sketch layer owns the pointer */
export type AnnotationState = {
  isOn: boolean;
  /** oldest first */
  groups?: AnnotationGroup[];
  activeId?: string;
  shape?: AnnotationShape;
  undoVersion?: number;
  redoVersion?: number;
};

/** how far the overlay keeps clear of each edge of the map area, in px */
export type AnnotationInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type AnnotationOverlayConfig = {
  /** stacking inside the map wrapper. Default: 500 */
  zIndex?: number;
  /** the app's top bar, measured. Default: "#topNavbar" */
  toolbarSelector?: string;
  /** added to the measured top bar, applied as given to the other edges */
  inset?: AnnotationInset;
  langCode?: string;
  hideMenu?: boolean;
  hideTools?: boolean;
  hideHelp?: boolean;
  hideLibrary?: boolean;
  hideHistory?: boolean;
  hideWhenOff?: boolean;
  shapeTools?: boolean;
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
