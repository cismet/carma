import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
  type ReactNode,
} from "react";

import * as L from "leaflet";
import {
  TopicMapContextProvider,
  TopicMapContext as ReactCismapTopicMapContext,
} from "react-cismap/contexts/TopicMapContextProvider";

import {
  CarmaTopicMapContext,
  type CarmaTopicMapContextType,
} from "./CarmaTopicMapContext";
import type { MapView } from "@carma-appframeworks/portals";

export interface TopicMapConfig {
  infoBoxPixelWidth?: number;
}

export interface CarmaTopicMapContextProviderProps {
  children: ReactNode;
  config: TopicMapConfig;
}

/**
 * Inner component that accesses react-cismap context and provides leafletMap
 * Note: This component will re-render on every map move due to react-cismap context changes
 * but the context value is memoized to prevent unnecessary child re-renders
 */
const CarmaTopicMapContextInner = ({ children }: { children: ReactNode }) => {
  const reactCismapContext = useContext(ReactCismapTopicMapContext);
  const isSuspendedRef = useRef(false);
  const leafletMapRef = useRef<L.Map | undefined>(undefined);

  // Log significant state changes only (not every map move)
  const prevHasLeafletMap = useRef(false);
  if (prevHasLeafletMap.current !== !!leafletMapRef.current) {
    console.log("[TopicMapContext] Map state changed:", {
      hasMap: !!leafletMapRef.current,
      isSuspended: isSuspendedRef.current,
    });
    prevHasLeafletMap.current = !!leafletMapRef.current;
  }

  // MapView data storage
  const currentMapViewRef = useRef<MapView | null>(null);
  const homeMapViewRef = useRef<MapView | null>(null);
  const onMapViewUpdateRef = useRef<(() => void) | null>(null);

  // Shared helper to trigger Portal callback after MapView updates
  const triggerMapViewUpdate = useCallback(() => {
    if (onMapViewUpdateRef.current) {
      console.log("[TopicMapContext] Triggering MapView update callback");
      onMapViewUpdateRef.current();
    }
  }, []);

  // MapView setters - update ref and notify Portal
  const setCurrentMapView = useCallback((mapView: MapView) => {
    console.log("[TopicMapContext] setCurrentMapView:", mapView);
    currentMapViewRef.current = mapView;
    triggerMapViewUpdate();
  }, [triggerMapViewUpdate]);

  const setHomeMapView = useCallback((mapView: MapView) => {
    console.log("[TopicMapContext] setHomeMapView:", mapView);
    homeMapViewRef.current = mapView;
    triggerMapViewUpdate();
  }, [triggerMapViewUpdate]);

  // MapView getters - return current ref values
  const getCurrentMapView = useCallback(() => currentMapViewRef.current, []);
  const getHomeMapView = useCallback(() => homeMapViewRef.current, []);

  // Fly to home - called by Portal when home button clicked
  const flyHome = useCallback(() => {
    const homeView = homeMapViewRef.current;
    const map = leafletMapRef.current;
    console.log("[TopicMapContext] flyHome", { homeView, hasMap: !!map });
    
    if (map && homeView) {
      // MapView uses center: [lat, lng] format
      map.flyTo(homeView.center, homeView.zoom);
    }
  }, []);

  // Callback setter - Portal registers its callback here
  const onMapViewUpdate = useCallback((callback: () => void) => {
    onMapViewUpdateRef.current = callback;
    console.log("[TopicMapContext] MapView update callback registered");
  }, []);

  // Direct access to leaflet map element
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMap = (reactCismapContext as any).routedMapRef?.leafletMap
    ?.leafletElement;

  // Update the ref when leaflet map changes
  useEffect(() => {
    leafletMapRef.current = leafletMap;
    if (leafletMap) {
      leafletMap.whenReady(() => {
        console.debug("[TopicMapContext] Leaflet map ready");
      });
    }
  }, [leafletMap]);

  const contextValue = useMemo<CarmaTopicMapContextType>(
    () => ({
      isSuspendedRef,
      leafletMapRef,
      setCurrentMapView,
      setHomeMapView,
      getCurrentMapView,
      getHomeMapView,
      flyHome,
      onMapViewUpdate,
    }),
    [
      setCurrentMapView,
      setHomeMapView,
      getCurrentMapView,
      getHomeMapView,
      flyHome,
      onMapViewUpdate,
    ]
  );

  return (
    <CarmaTopicMapContext.Provider value={contextValue}>
      {children}
    </CarmaTopicMapContext.Provider>
  );
};

/**
 * Augments react-cismap TopicMapContextProvider with position data management.
 * Provides setters and getters for position data that Portal context can use.
 * Manages suspended state and leaflet map reference.
 */
export const CarmaTopicMapContextProvider = ({
  children,
  config,
}: CarmaTopicMapContextProviderProps) => {
  const { infoBoxPixelWidth = 350 } = config;

  return (
    <TopicMapContextProvider infoBoxPixelWidth={infoBoxPixelWidth}>
      <CarmaTopicMapContextInner>{children}</CarmaTopicMapContextInner>
    </TopicMapContextProvider>
  );
};

export default CarmaTopicMapContextProvider;
