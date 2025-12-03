import type { StyleSpecification } from "maplibre-gl";
import { createContext, useContext, useState, ReactNode } from "react";

interface LibreContextType {
  mapStyle: StyleSpecification | null;
  setMapStyle: (style: StyleSpecification) => void;
}

const defaultContext: LibreContextType = {
  mapStyle: null,
  setMapStyle: () => {},
};

export const LibreContext = createContext<LibreContextType>(defaultContext);

interface LibreContextProviderProps {
  children: ReactNode;
}

export const LibreContextProvider = ({
  children,
}: LibreContextProviderProps) => {
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null>(null);

  return (
    <LibreContext.Provider value={{ mapStyle, setMapStyle }}>
      {children}
    </LibreContext.Provider>
  );
};

export const useLibreContext = () => useContext(LibreContext);
