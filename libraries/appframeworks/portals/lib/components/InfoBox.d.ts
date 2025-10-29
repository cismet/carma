interface InfoBoxProps {
  currentFeature?: any;
  featureCollection?: any;
  selectedIndex?: any;
  next?: any;
  previous?: any;
  fitAll?: any;
  panelClick?: any;
  pixelwidth: any;
  header: string | JSX.Element;
  headerColor: string;
  links?: any;
  title?: any;
  subtitle?: any;
  additionalInfo?: any;
  zoomToAllLabel?: any;
  currentlyShownCountLabel?: any;
  collapsedInfoBox?: any;
  setCollapsedInfoBox?: any;
  noCurrentFeatureTitle?: any;
  noCurrentFeatureContent?: any;
  isCollapsible?: any;
  hideNavigator?: any;
  handleResponsiveDesign?: any;
  infoStyle?: any;
  fixedRow?: any;
  secondaryInfoBoxElements?: any;
  colorizer?: any;
  defaultContextValues?: any;
  mapWidth?: number | null;
  infoBoxBottomResMargin?: number;
  bigMobileIconsInsteadOfCollapsing?: boolean;
}
export declare const InfoBox: ({
  currentFeature,
  featureCollection,
  selectedIndex,
  next,
  previous,
  fitAll,
  panelClick,
  pixelwidth,
  header,
  headerColor,
  links,
  title,
  subtitle,
  additionalInfo,
  zoomToAllLabel,
  currentlyShownCountLabel,
  collapsedInfoBox,
  setCollapsedInfoBox,
  noCurrentFeatureTitle,
  noCurrentFeatureContent,
  isCollapsible,
  hideNavigator,
  handleResponsiveDesign,
  infoStyle,
  fixedRow,
  secondaryInfoBoxElements,
  mapWidth,
  infoBoxBottomResMargin,
  colorizer,
  defaultContextValues,
  bigMobileIconsInsteadOfCollapsing,
}: InfoBoxProps) => import("react/jsx-runtime").JSX.Element;
export default InfoBox;
