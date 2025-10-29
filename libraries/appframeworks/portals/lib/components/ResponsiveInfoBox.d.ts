export declare const MODES: {
  DEFAULT: string;
  AB: string;
  BIG_MOBILE_ICONS: string;
};
interface ResponsiveInfoBoxProps {
  panelClick: (event: React.MouseEvent) => void;
  pixelwidth: number;
  header: React.ReactNode;
  collapsedInfoBox?: boolean;
  setCollapsedInfoBox?: (value: boolean) => void;
  isCollapsible?: boolean;
  handleResponsiveDesign?: boolean;
  infoStyle?: React.CSSProperties;
  secondaryInfoBoxElements?: React.ReactNode[];
  alwaysVisibleDiv?: React.ReactNode;
  collapsibleDiv?: React.ReactNode;
  collapsibleStyle?: React.CSSProperties;
  fixedRow?: boolean;
  defaultContextValues?: any;
  divWhenCollapsed?: React.ReactNode;
  divWhenLarge?: React.ReactNode;
  mode?: string;
  mapWidth?: number | null;
  infoBoxBottomMargin?: number;
}
export declare const ResponsiveInfoBox: ({
  panelClick,
  pixelwidth,
  header,
  collapsedInfoBox,
  setCollapsedInfoBox,
  isCollapsible,
  handleResponsiveDesign,
  infoStyle,
  secondaryInfoBoxElements,
  alwaysVisibleDiv,
  collapsibleDiv,
  collapsibleStyle,
  fixedRow,
  defaultContextValues,
  divWhenCollapsed,
  divWhenLarge,
  mode,
  mapWidth,
  infoBoxBottomMargin,
}: ResponsiveInfoBoxProps) => import("react/jsx-runtime").JSX.Element;
export default ResponsiveInfoBox;
