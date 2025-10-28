import { createContext, MutableRefObject } from "react";
import type L from "leaflet";
import type { MapView } from "@carma-mapping/engines/leaflet";

export interface CarmaTopicMapContextType {
  isSuspendedRef: MutableRefObject<boolean>;
  leafletMapRef: MutableRefObject<L.Map | undefined>;

  // MapView data - Portal context will call these to set map view data
  setCurrentMapView: (mapView: MapView) => void;
  setHomeMapView: (mapView: MapView) => void;

  // MapView data getters
  getCurrentMapView: () => MapView | null;
  getHomeMapView: () => MapView | null;

  // Zoom controls - Portal calls these when zoom buttons are clicked
  zoomIn: () => void;
  zoomOut: () => void;

  // Fly to home - Portal calls this when home button is clicked
  flyHome: () => void;

  // Callback setter for MapView updates
  onMapViewUpdate: (callback: () => void) => void;

  // Stable TopicMap context values (from react-cismap)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRoutedMapRef: () => any;
  getReferenceSystem: () => string | undefined;
  getReferenceSystemDefinition: () => string | undefined;
}

export const CarmaTopicMapContext =
  createContext<CarmaTopicMapContextType | null>(null);
