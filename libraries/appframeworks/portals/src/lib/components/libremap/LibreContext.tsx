import type { StyleSpecification } from "maplibre-gl";
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
}

const defaultContext: LibreContextType = {
  mapStyle: null,
  setMapStyle: () => {},
  geoJsonMetadata: [],
  setGeoJsonMetadata: () => {},
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

  return (
    <LibreContext.Provider
      value={{ mapStyle, setMapStyle, geoJsonMetadata, setGeoJsonMetadata }}
    >
      {children}
    </LibreContext.Provider>
  );
};

export const useLibreContext = () => useContext(LibreContext);
