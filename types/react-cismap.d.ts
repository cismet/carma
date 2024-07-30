declare module "react-cismap/contexts/TopicMapContextProvider" {
  import { Context, FC } from "react";
  interface RoutedMapRefContext {
    routedMapRef: {
      leafletMap?: {
        leafletElement: L.Map;
      };
    };
    leafletMap?: {
      leafletElement: L.Map;
    };
  }
  interface DispatchContext {
    zoomToFeature: (feature: any) => void;
  }
  export const TopicMapContext: Context<RoutedMapRefContext>;
  export const TopicMapDispatchContext: Context<DispatchContext>;
  export const TopicMapContextProvider: FC<any>;
  export default TopicMapContextProvider;
}

declare module "react-cismap/contexts/UIContextProvider" {
  import { Context, FC } from "react";

  export const UIContext: Context<{
    appMenuActiveMenuSection: string;
    appMenuVisible: boolean;
    secondaryInfoVisible: boolean;
  }>;

  export const UIDispatchContext: Context<{
    setAppMenuActiveMenuSection: (section: string) => void;
    setAppMenuVisible: (section: boolean) => void;
    setSecondaryInfoVisible: (section: boolean) => void;
  }>;
  export const UIDispatchContextProvider: FC<TopicMapContextProviderProps>;
  export default UIDispatchContextProvider;
}

declare module "react-cismap/contexts/FeatureCollectionContextProvider" {
  import { Context, FC } from "react";
  export const FeatureCollectionContext: Context<{
    selectedFeature: any;
    clusteringOptions: any;
    filteredItems: any;
    shownFeatures: any;
    filterState: any;
  }>;
  export const FeatureCollectionDispatchContext: Context<{
    setSelectedFeatureByPredicate: (predicate: any) => void;
    setClusteringOptions: (options: any) => void;
    setFilterState: (state: any) => void;
  }>;
  export const FeatureCollectionContextProvider: FC<TopicMapContextProviderProps>;
  export default FeatureCollectionContextProvider;
}

export const FeatureCollectionDisplayWithTooltipLabels: FC<any>;


declare module "react-cismap/contexts/TopicMapStylingContextProvider" {
  import { Context, FC } from "react";
  export const TopicMapStylingContext: Context<{
    markerSymbolSize: number;
    additionalStylingInfo: any;
  }>;
  export const TopicMapStylingDispatchContext: Context<{
    setMarkerSymbolSize: (size: number) => void;
  }>;
  export const TopicMapStylingContextProvider: FC<TopicMapContextProviderProps>;
  export default TopicMapStylingContextProvider;
}

declare module "react-cismap/contexts/ResponsiveTopicMapContextProvider" {
  import { Context, FC } from "react";
  export const ResponsiveTopicMapContext: Context<{
    windowSize: {
      width: number;
      height: number;
    };
  }>;
  export const ResponsiveTopicMapContextProvider: FC<TopicMapContextProviderProps>;
  export default ResponsiveTopicMapContextProvider;
}

declare module "react-cismap/topicmaps/TopicMapComponent" {
  const TopicMapComponent: FC<TopicMapProps>;
  export default TopicMapComponent;
}

declare module "react-cismap/StyledWMSTileLayer" {
  const StyledWMSTileLayer: any;
  export default StyledWMSTileLayer;
}

declare module "react-cismap/constants/gis" {
  const proj4crs25832def: string;
}

declare module "react-cismap/topicmaps/InfoBox" {
  const InfoBox: FC<InfoBoxProps>;
  export default InfoBox;
}

declare module "react-cismap" {
  const TransitiveReactLeaflet: any;
  const MappingConstants: {
    proj4crs3857def: string;
    proj4crs25832def: string;
    crs3857: string;
    crs25832: string;
  };
}

declare module "react-cismap/tools/uiHelper" {
  const getActionLinksForFeature: (feature: any, options: any) => any;
}

declare module "react-cismap/CismapLayer" {
  const CismapLayer: FC<CismapLayerProps>;
  export default CismapLayer;
}
