/**
 * Feature information for displaying in the infobox
 * @property id - Unique identifier
 * @property showMarker - Whether to show a marker for this feature
 * @property properties - Feature properties for display
 * @property sourceFeature - (Optional) Original MapLibre feature from the map, used for filter checks
 * @property geometry - (Optional) GeoJSON geometry of the feature
 */
export type FeatureInfo = {
  id: string;
  showMarker?: boolean;
  properties: FeatureInfoProperties;
  sourceFeature?: any;
  geometry?: any;
};

export type FeatureInfoProperties = {
  header?: string;
  headerColor?: string;
  title: string;
  subtitle?: string;
  additionalInfo?: string;
  email?: string;
  tel?: string;
  url?: string;
  genericLinks?: {
    url: string;
    tooltip: string;
    icon: JSX.Element;
    target?: string;
  }[];
  wmsProps?: {
    [key: string]: string;
  };
};
