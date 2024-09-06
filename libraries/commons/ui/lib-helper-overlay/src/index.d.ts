export type OverlayHelperHightlighterProps = {
  configs: OverlayHelperConfig[];
  closeOverlay: () => void;
  transparency?: number;
  color?: string;
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
  | "bottom"
  | "left-center"
  | "left-top"
  | "left-bottom"
  | "right-center"
  | "right-top"
  | "right-bottom"
  | "top-center"
  | "top-right"
  | "top-left"
  | "bottom-center"
  | "bottom-right"
  | "bottom-left";

export interface OverlayHelperConfig {
  el: HTMLElement;
  content: JSX.Element | string;
  containerPos?: PositionOverlayHelper;
  contentPos?: PositionOverlayHelper;
  contentWidth?: string;
  secondary?: Secondary;
}

type SecondaryPlacement =
  | "top"
  | "left"
  | "right"
  | "bottom"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "leftTop"
  | "leftBottom"
  | "rightTop"
  | "rightBottom";

export type Secondary = {
  content: JSX.Element | string;
  secondaryPos?: SecondaryPlacement;
};

export type OptionsOverlayHelper = {
  primary: {
    containerPos?: PositionOverlayHelper;
    contentPos?: PositionOverlayHelper;
    contentWidth?: string;
    content: JSX.Element | string;
  };
  secondary?: Secondary;
};

type Position = { [key: string]: string | number };

export interface HighlightRect {
  rect: DOMRect;
  content: JSX.Element | string;
  pos: Position;
  contentPos: any;
  contPos: Position;
  contentWidth?: string;
  secondary?: JSX.Element | string;
  secondaryPos?: SecondaryPlacement;
}

export type OverlayTourProviderProps = {
  children: JSX.Element;
  showOverlay: boolean;
  closeOverlay: () => void;
  transparency?: number;
  color?: string;
};
