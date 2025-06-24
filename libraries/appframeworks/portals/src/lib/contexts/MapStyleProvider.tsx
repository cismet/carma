import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useHashState } from "./HashStateProvider";

export type MapStyle = string;

export interface MapStyleConfig {
  initialStyle: MapStyle;
  availableStyles: readonly MapStyle[];
}

interface MapStyleContextType {
  currentStyle: MapStyle;
  setCurrentStyle: (style: MapStyle) => void;
}

const MapStyleContext = createContext<MapStyleContextType | undefined>(
  undefined
);

interface MapStyleProviderProps {
  children: ReactNode;
  config: MapStyleConfig;
}

export const MapStyleProvider = ({
  children,
  config,
}: MapStyleProviderProps) => {
  const initialStyle = config.initialStyle;
  const [currentStyle, setCurrentStyle] = useState<MapStyle>(initialStyle);
  const { updateHash } = useHashState();

  useEffect(() => {
    // Update the hash state when the current style changes
    updateHash({ mapStyle: currentStyle }, { debugLabel: "MapStyleProvider" });
  }, [currentStyle, updateHash]);

  const value: MapStyleContextType = {
    currentStyle,
    setCurrentStyle,
  };

  return (
    <MapStyleContext.Provider value={value}>
      {children}
    </MapStyleContext.Provider>
  );
};

export const useMapStyle = () => {
  const context = useContext(MapStyleContext);
  if (context === undefined) {
    throw new Error("useMapStyle must be used within a MapStyleProvider");
  }
  return context;
};
