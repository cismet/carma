export type OverlayHelperHightlighterProps = {
  configs: OverlayHelperConfig[];
  closeOverlay: () => void;
  transparency?: number;
  color?: string;
  showSecondaryWithKey: (key: string | null) => void;
  showOverlay: (show: boolean) => void;
  openedSecondaryKey: string | null;
};

export type OverlayTourAction = (arg: OverlayHelperConfig) => void;

export type OverlayTourContext = {
  configs: OverlayHelperConfig[];
  addConfig: OverlayTourAction;
  removeConfig: OverlayTourAction;
  showSecondaryWithKey: null | string;
  setSecondaryWithKey: (key: string) => void;
  showOverlay: (show: boolean) => void;
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
    key: string;
    containerPos?: PositionOverlayHelper;
    contentPos?: PositionOverlayHelper;
    contentWidth?: string;
    position?: React.CSSProperties;
    content: JSX.Element | string;
  };
  secondary?: Secondary;
};

export interface OverlayHelperConfig {
  key: string;
  el?: HTMLElement;
  content: JSX.Element | string;
  containerPos?: PositionOverlayHelper;
  contentPos?: PositionOverlayHelper;
  contentWidth?: string;
  position?: React.CSSProperties;
  secondary?: Secondary;
}

type Position = { [key: string]: string | number };

export interface HighlightRect {
  key: string;
  rect: DOMRect | null;
  content: JSX.Element | string;
  pos: Position;
  contentPos: any;
  contPos: Position;
  contentWidth?: string;
  position?: React.CSSProperties;
  secondary?: JSX.Element | string;
  secondaryPos?: SecondaryPlacement;
}

export type OverlayTourProviderProps = {
  children: JSX.Element;
  show: boolean;
  closeOverlay: () => void;
  transparency?: number;
  color?: string;
  // showSecondaryWithKey: (key: string) => void;
  // openedSecondaryKey: string | null;
};

export type GeoElementType = {
  key: string;
  containerPos?: PositionOverlayHelper;
  contentPos?: PositionOverlayHelper;
  content: JSX.Element | string;
  contentWidth?: string;
  position?: React.CSSProperties;
  secondary?: {
    content: JSX.Element | string;
    secondaryPos?: SecondaryPlacement;
  };
};
