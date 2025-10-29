interface ActionLinksConfig {
  entityClassName?: string;
  displayZoomToFeature?: boolean;
  zoomToFeature?: (feature: any) => void;
  displaySecondaryInfoAction?: boolean;
  setVisibleStateOfSecondaryInfo?: (visible: boolean) => void;
}
export declare const getActionLinksForFeature: (
  feature: any,
  {
    entityClassName,
    displayZoomToFeature,
    zoomToFeature,
    displaySecondaryInfoAction,
    setVisibleStateOfSecondaryInfo,
  }?: ActionLinksConfig
) => JSX.Element[];
export {};
