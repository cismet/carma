declare module 'react-cismap/contexts/TopicMapContextProvider' {
  import { Context, FC } from 'react';
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
  export const TopicMapContext: Context<RoutedMapRefContext>;
  export const TopicMapContextProvider: FC<TopicMapContextProviderProps>;
  export default TopicMapContextProvider;
}

declare module 'react-cismap/contexts/UIContextProvider' {
  import { Context, FC } from 'react';

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

declare module 'react-cismap/contexts/FeatureCollectionContextProvider' {
  import { Context, FC } from 'react';
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

declare module 'react-cismap/contexts/TopicMapStylingContextProvider' {
  import { Context, FC } from 'react';
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

declare module 'react-cismap/contexts/ResponsiveTopicMapContextProvider' {
  import { Context, FC } from 'react';
  export const ResponsiveTopicMapContext: Context<{
    windowSize: {
      width: number;
      height: number;
    };
  }>;
  export const ResponsiveTopicMapContextProvider: FC<TopicMapContextProviderProps>;
  export default ResponsiveTopicMapContextProvider;
}

declare module 'react-cismap/topicmaps/TopicMapComponent' {
  const TopicMapComponent: FC<TopicMapProps>;
  export default TopicMapComponent;
}

declare module 'react-cismap/StyledWMSTileLayer' {
  const StyledWMSTileLayer: any;
  export default StyledWMSTileLayer;
}
