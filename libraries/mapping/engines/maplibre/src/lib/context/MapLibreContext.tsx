import { createContext, useContext } from "react";
import type { MutableRefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * MapLibreContext - Provides access to MapLibre GL map instance
 *
 * Slim context for MapLibre engine, analogous to CesiumContext and CarmaTopicMapContext.
 */
export interface MapLibreContextType {
  // Map instance ref
  mapRef: MutableRefObject<MapLibreMap | null>;

  // Zoom controls
  zoomIn: () => void;
  zoomOut: () => void;

  // Home control
  flyHome: () => void;
}

export const MapLibreContext = createContext<MapLibreContextType | undefined>(
  undefined
);

export const useMapLibreContext = () => {
  const context = useContext(MapLibreContext);
  if (!context) {
    throw new Error(
      "useMapLibreContext must be used within a MapLibreContextProvider"
    );
  }
  return context;
};
