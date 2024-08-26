export type OverlayHelperHightlighterProps = {
  configs: OverlayHelperConfig[];
  closeOverlay: () => {};
};

export type OverlayTourAction = (arg: OverlayHelperConfig) => void;

export type OverlayTourContext = {
  configs: OverlayHelperConfig[];
  addConfig: OverlayTourAction;
  removeConfig: OverlayTourAction;
};

export type PositionOverlayHelper =
  | "center"
  | "top"
  | "left"
  | "right"
  | "bottom";

export interface OverlayHelperConfig {
  el: HTMLElement;
  message: string;
  containerPos: PositionOverlayHelper;
  contentPos: PositionOverlayHelper;
}

export type OptionsOverlayHelper = {
  containerPos?: PositionOverlayHelper;
  contentPos?: PositionOverlayHelper;
};

type Position = { [key: string]: string | number };

export interface HighlightRect {
  rect: DOMRect;
  message: string;
  pos: Position;
  contentPos: any;
  contPos: Position;
}
