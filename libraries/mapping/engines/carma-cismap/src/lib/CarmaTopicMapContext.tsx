import { createContext, MutableRefObject } from "react";
import type L from "leaflet";
import type { MapView } from "@carma-appframeworks/portals";

export interface CarmaTopicMapContextType {
  isSuspendedRef: MutableRefObject<boolean>;
  leafletMapRef: MutableRefObject<L.Map | undefined>;

  // MapView data - Portal context will call these to set map view data
  setCurrentMapView: (mapView: MapView) => void;
  setHomeMapView: (mapView: MapView) => void;

  // MapView data getters
  getCurrentMapView: () => MapView | null;
  getHomeMapView: () => MapView | null;

  // Fly to home - Portal calls this when home button is clicked
  flyHome: () => void;

  // Callback setter for MapView updates
  onMapViewUpdate: (callback: () => void) => void;
}

export const CarmaTopicMapContext =
  createContext<CarmaTopicMapContextType | null>(null);
