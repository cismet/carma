import type { Positions } from "@carma-mapping/map-controls-layout";

/** the `excalidrawMode` channel: whether the sketch layer owns the pointer */
export type ExcalidrawState = {
  isOn: boolean;
};

/** how far the overlay keeps clear of each edge of the map area, in px */
export type ExcalidrawInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type ExcalidrawOverlayConfig = {
  /** stacking inside the map wrapper. Default: 500 */
  zIndex?: number;
  /** the app's top bar, measured. Default: "#topNavbar" */
  toolbarSelector?: string;
  /** added to the measured top bar, applied as given to the other edges */
  inset?: ExcalidrawInset;
  hideMenu?: boolean;
  hideZoom?: boolean;
  background?: string;
  backgroundOpacity?: number;
};

export type ExcalidrawControlConfig = {
  /** Corner the button is registered in. Default: "topleft" */
  position?: Positions;
  /** Sort order within that corner. Default: 90 */
  order?: number;
};
