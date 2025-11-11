/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Type declarations for react-cismap external package
 * Consolidated in @carma-commons/cismap to avoid duplication across packages
 *
 * This extends and enhances the declarations from react-cismap source with additional
 * properties needed by CARMA (realRoutedMapRef, maskingPolygon, referenceSystem, etc.)
 */

import type { Context, FC, RefObject } from "react";
import type { Map } from "leaflet";

declare module "react-cismap/ProjSingleGeoJson" {
  export const ProjSingleGeoJson: FC<any>;
}

declare module "react-cismap/GazetteerHitDisplay" {
  const GazetteerHitDisplay: FC<any>;
  export default GazetteerHitDisplay;
}

declare module "react-cismap/contexts/TopicMapContextProvider" {
  // Enhanced version with additional CARMA-specific properties
  interface RoutedMapRefContext {
    routedMapRef?: {
      leafletMap?: {
        leafletElement: Map;
      };
    };
    realRoutedMapRef?: RefObject<{
      leafletMap?: {
        leafletElement: Map;
      };
    }>;
    leafletMap?: {
      leafletElement: Map;
    };
    referenceSystem?: string;
    referenceSystemDefinition?: string;
    maskingPolygon?: any;
  }
  interface DispatchContext {
    zoomToFeature: (feature: any) => void;
  }
  export const TopicMapContext: Context<RoutedMapRefContext>;
  export const TopicMapDispatchContext: Context<DispatchContext>;
  export const TopicMapContextProvider: FC<any>;
  export default TopicMapContextProvider;
}

declare module "react-cismap/tools/gazetteerHelper" {
  export const getGazDataForTopicIds: (sources: any, topicIds: string[]) => any;
  export const builtInGazetteerHitTrigger: Function;
}

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

declare module "react-cismap/tools/uiHelper" {
  export const getActionLinksForFeature: (feature: any, options: any) => any;
  export const getSymbolSVGGetter: (
    svgCode: string,
    svgBadgeDimension: { width: number | string; height: number | string }
  ) => any;
}

declare module "react-cismap/contexts/ResponsiveTopicMapContextProvider" {
  export const ResponsiveTopicMapContext: Context<any>;
  export const ResponsiveTopicMapDispatchContext: Context<any>;
  export const ResponsiveTopicMapContextProvider: FC<any>;
  export default ResponsiveTopicMapContextProvider;
}

declare module "react-cismap/contexts/LightBoxContextProvider" {
  export const LightBoxContext: Context<any>;
  export const LightBoxDispatchContext: Context<any>;
  export const LightBoxContextProvider: FC<any>;
  export default LightBoxContextProvider;
}

declare module "react-cismap/topicmaps/InfoBoxFotoPreview" {
  const InfoBoxFotoPreview: FC<any>;
  export default InfoBoxFotoPreview;
}

declare module "react-cismap/commons/Icon" {
  const Icon: FC<any>;
  export default Icon;
}

declare module "react-cismap/commons/IconLink" {
  const IconLink: FC<any>;
  export default IconLink;
}

declare module "react-cismap/commons/Panel" {
  const Panel: FC<any>;
  export default Panel;
}

declare module "react-cismap/commons/CollapsibleWell" {
  const CollapsibleWell: FC<any>;
  export default CollapsibleWell;
}

declare module "react-cismap/commons/CollapsibleABWell" {
  const CollapsibleABWell: FC<any>;
  export default CollapsibleABWell;
}

declare module "react-cismap/topicmaps/menu/Section" {
  const Section: FC<any>;
  export default Section;
}
