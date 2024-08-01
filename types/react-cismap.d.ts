/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "react-cismap" {
  import * as React from "react";
  import * as L from "leaflet";

  export { mappingHelpers as MappingHelpers } from "./tools";
  export { gis as MappingConstants } from "./constants";

  export class ProjGeoJson extends React.Component<any, any> {}
  export class FeatureCollectionDisplay extends React.Component<any, any> {}
  export class FeatureCollectionDisplayWithTooltipLabels extends React.Component<
    any,
    any
  > {}
  export class RoutedMap extends React.Component<any, any> {}

  export function getLayersByName(name: string): React.ReactElement;

  export class FullscreenControl extends React.Component<any, any> {}
  export class LocateControl extends React.Component<any, any> {}
  export class NewPolyControl extends React.Component<any, any> {}
  export class NewMarkerControl extends React.Component<any, any> {}

  export * as TransitiveReactLeaflet from "react-leaflet";
  export * as TransitiveLeaflet from "leaflet";

  export const ID: number;
}

declare module "react-cismap/CismapLayer" {
  const CismapLayer: FC<any>;
  export default CismapLayer;
}

declare module "react-cismap/FeatureCollection" {
  const FeatureCollection: FC<any>;
  export default FeatureCollection;
}

declare module "react-cismap/StyledWMSTileLayer" {
  const StyledWMSTileLayer: any;
  export default StyledWMSTileLayer;
}

/* CONSTANTS */

declare module "react-cismap/constants/gis" {
  const proj4crs25832def: string;
}

/* CONTEXTS */

declare module "react-cismap/contexts/FeatureCollectionContextProvider" {
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
  export const FeatureCollectionContextProvider: FC<
    typeof FeatureCollectionContext
  >;
  export default FeatureCollectionContextProvider;
}

declare module "react-cismap/contexts/ResponsiveTopicMapContextProvider" {
  export const ResponsiveTopicMapContext: Context<{
    windowSize: {
      width: number;
      height: number;
    };
  }>;
  export const ResponsiveTopicMapContextProvider: FC<
    typeof ResponsiveTopicMapContext
  >;
  export default ResponsiveTopicMapContextProvider;
}

declare module "react-cismap/contexts/TopicMapContextProvider" {
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
  export const TopicMapContextProvider: FC<typeof TopicMapContext>;
  export default TopicMapContextProvider;
}

declare module "react-cismap/contexts/TopicMapStylingContextProvider" {
  export const TopicMapStylingContext: Context<{
    markerSymbolSize: number;
    additionalStylingInfo: any;
  }>;

  export const TopicMapStylingDispatchContext: Context<{
    setMarkerSymbolSize: (size: number) => void;
  }>;
  export const TopicMapStylingContextProvider: FC<
    typeof TopicMapStylingContext
  >;
  export default TopicMapStylingContextProvider;
}

declare module "react-cismap/contexts/UIContextProvider" {
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
  export const UIDispatchContextProvider: FC<typeof UIDispatchContext>;
  export default UIDispatchContextProvider;
}

/* TOOLS */

declare module "react-cismap/tools/fetching" {
  export const md5FetchText: (prefix: string, url: string) => Promise<string>;
}

declare module "react-cismap/tools/gazetteerHelper" {
  export const getGazDataForTopicIds: (sources: any, topicIds: string[]) => any;
}

declare module "react-cismap/tools/uiHelper" {
  const getActionLinksForFeature: (feature: any, options: any) => any;
  const getSymbolSVGGetter: (svgCode: string, svgBadgeDimension: {width: number | string, height: number | string}) => any;
}

/* TOPICMAPS */

declare module "react-cismap/topicmaps/TopicMapComponent" {
  const TopicMapComponent: FC<any>;
  export default TopicMapComponent;
}
declare module "react-cismap/topicmaps/InfoBox" {
  const InfoBox: FC<any>;
  export default InfoBox;
}
