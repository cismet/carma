import type { StyleSpecification } from "maplibre-gl";
import type maplibregl from "maplibre-gl";
import { createContext, useContext, useState, ReactNode } from "react";

export interface GeoJsonMetadata {
  sourceId: string;
  uniqueColors: string[];
}

interface LibreContextType {
  mapStyle: StyleSpecification | null;
  setMapStyle: (style: StyleSpecification) => void;
  geoJsonMetadata: GeoJsonMetadata[];
  setGeoJsonMetadata: (metadata: GeoJsonMetadata[]) => void;
  map: maplibregl.Map | null;
  setMap: (map: maplibregl.Map | null) => void;
}

const defaultContext: LibreContextType = {
  mapStyle: null,
  setMapStyle: () => {},
  geoJsonMetadata: [],
  setGeoJsonMetadata: () => {},
  map: null,
  setMap: () => {},
};

export const LibreContext = createContext<LibreContextType>(defaultContext);

interface LibreContextProviderProps {
  children: ReactNode;
}

export const LibreContextProvider = ({
  children,
}: LibreContextProviderProps) => {
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null>(null);
  const [geoJsonMetadata, setGeoJsonMetadata] = useState<GeoJsonMetadata[]>([]);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  return (
    <LibreContext.Provider
      value={{
        mapStyle,
        setMapStyle,
        geoJsonMetadata,
        setGeoJsonMetadata,
        map,
        setMap,
      }}
    >
      {children}
    </LibreContext.Provider>
  );
};

export const useLibreContext = () => useContext(LibreContext);
