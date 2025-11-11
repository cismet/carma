/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Type declarations for react-cismap external package
 * 
 * Note: These declarations are also in @carma-commons/cismap but must be duplicated here
 * because TypeScript doesn't automatically pick up .d.ts files from dependencies.
 * This is the minimal subset needed by the selection provider.
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
