import React, { useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapLibreContext, type MapLibreContextType } from "./MapLibreContext";

export interface MapLibreContextProviderProps {
  children: ReactNode;
}

/**
 * MapLibreContextProvider - Provides MapLibre GL context
 *
 * Slim provider that exposes map ref and zoom controls.
 * Map instance should be set by the component that creates the MapLibre map.
 */
export const MapLibreContextProvider: React.FC<
  MapLibreContextProviderProps
> = ({ children }) => {
  const mapRef = useRef<MapLibreMap | null>(null);

  const zoomIn = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  }, []);

  const zoomOut = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  }, []);

  const flyHome = useCallback(() => {
    // Home position will be set by Portal via map.jumpTo() or map.flyTo()
    // For now, this is a placeholder - Portal should call this when home button is clicked
    console.log(
      "[MapLibreContext] flyHome called - Portal should handle home position"
    );
  }, []);

  const contextValue = useMemo<MapLibreContextType>(
    () => ({
      mapRef,
      zoomIn,
      zoomOut,
      flyHome,
    }),
    [zoomIn, zoomOut, flyHome]
  );

  return (
    <MapLibreContext.Provider value={contextValue}>
      {children}
    </MapLibreContext.Provider>
  );
};
