export type FeatureInfo = {
  id: string;
  showMarker?: boolean;
  properties: FeatureInfoProperties;
};

export type FeatureInfoProperties = {
  header: string;
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
  }[];
  wmsProps?: {
    [key: string]: string;
  };
};
