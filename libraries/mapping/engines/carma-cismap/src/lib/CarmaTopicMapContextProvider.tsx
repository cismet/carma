import {
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useCallback,
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
import type { MapView } from "@carma-mapping/engines/leaflet";

export interface TopicMapConfig {
  infoBoxPixelWidth?: number;
}

export interface CarmaTopicMapContextProviderProps {
  children: ReactNode;
  config: TopicMapConfig;
}

/**
 * Inner component that accesses react-cismap context and provides leafletMap
 * Memoized to prevent unnecessary re-renders when parent updates
 * The context value is also memoized to prevent child re-renders
 */
const CarmaTopicMapContextInner = memo(({ children }: { children: ReactNode }) => {
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
  const setCurrentMapView = useCallback(
    (mapView: MapView) => {
      console.log("[TopicMapContext] setCurrentMapView:", mapView);
      currentMapViewRef.current = mapView;
      triggerMapViewUpdate();
    },
    [triggerMapViewUpdate]
  );

  const setHomeMapView = useCallback(
    (mapView: MapView) => {
      console.log("[TopicMapContext] setHomeMapView:", mapView);
      homeMapViewRef.current = mapView;
      triggerMapViewUpdate();
    },
    [triggerMapViewUpdate]
  );

  // MapView getters - return current ref values
  const getCurrentMapView = useCallback(() => currentMapViewRef.current, []);
  const getHomeMapView = useCallback(() => homeMapViewRef.current, []);

  // Zoom controls - called by Portal when zoom buttons clicked
  const zoomIn = useCallback(() => {
    const map = leafletMapRef.current;
    if (map) {
      map.zoomIn();
    }
  }, []);

  const zoomOut = useCallback(() => {
    const map = leafletMapRef.current;
    if (map) {
      map.zoomOut();
    }
  }, []);

  // Fly to home - called by Portal when home button clicked
  const flyHome = useCallback(() => {
    const homeView = homeMapViewRef.current;
    const map = leafletMapRef.current;
    console.log("[TopicMapContext] flyHome", { homeView, hasMap: !!map });

    if (map && homeView) {
      // MapView uses center: { lat, lng } format (LatLngLiteral)
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

  // Stable getters for react-cismap context values (prevent consumer re-renders)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routedMapRefRef = useRef<any>();
  const referenceSystemRef = useRef<string>();
  const referenceSystemDefinitionRef = useRef<string>();

  // Update refs from react-cismap context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routedMapRefRef.current = (reactCismapContext as any).realRoutedMapRef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  referenceSystemRef.current = (reactCismapContext as any).referenceSystem;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  referenceSystemDefinitionRef.current = (reactCismapContext as any).referenceSystemDefinition;

  const getRoutedMapRef = useCallback(() => routedMapRefRef.current, []);
  const getReferenceSystem = useCallback(() => referenceSystemRef.current, []);
  const getReferenceSystemDefinition = useCallback(() => referenceSystemDefinitionRef.current, []);

  const contextValue = useMemo<CarmaTopicMapContextType>(
    () => ({
      isSuspendedRef,
      leafletMapRef,
      setCurrentMapView,
      setHomeMapView,
      getCurrentMapView,
      getHomeMapView,
      zoomIn,
      zoomOut,
      flyHome,
      onMapViewUpdate,
      getRoutedMapRef,
      getReferenceSystem,
      getReferenceSystemDefinition,
    }),
    [
      setCurrentMapView,
      setHomeMapView,
      getCurrentMapView,
      getHomeMapView,
      zoomIn,
      zoomOut,
      flyHome,
      onMapViewUpdate,
      getRoutedMapRef,
      getReferenceSystem,
      getReferenceSystemDefinition,
    ]
  );

  return (
    <CarmaTopicMapContext.Provider value={contextValue}>
      {children}
    </CarmaTopicMapContext.Provider>
  );
});

CarmaTopicMapContextInner.displayName = "CarmaTopicMapContextInner";

/**
 * Augments react-cismap TopicMapContextProvider with position data management.
 * Provides setters and getters for position data that Portal context can use.
 * Manages suspended state and leaflet map reference.
 * Memoized to prevent unnecessary re-renders when parent updates.
 */
export const CarmaTopicMapContextProvider = memo(({
  children,
  config,
}: CarmaTopicMapContextProviderProps) => {
  const { infoBoxPixelWidth = 350 } = config;

  return (
    <TopicMapContextProvider infoBoxPixelWidth={infoBoxPixelWidth}>
      <CarmaTopicMapContextInner>{children}</CarmaTopicMapContextInner>
    </TopicMapContextProvider>
  );
});

CarmaTopicMapContextProvider.displayName = "CarmaTopicMapContextProvider";

export default CarmaTopicMapContextProvider;
