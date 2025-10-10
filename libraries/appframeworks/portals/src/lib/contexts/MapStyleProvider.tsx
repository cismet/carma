import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useHashState } from "./HashStateProvider";
import { type MapStyleKey, MapStyleKeys, isMapStyleKey } from "../constants";

export interface MapStyleConfig {
  defaultStyle: MapStyleKey;
  availableStyles: readonly MapStyleKey[];
}

interface MapStyleContextType {
  currentStyle: MapStyleKey;
  setCurrentStyle: (style: MapStyleKey) => void;
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
  const { defaultStyle } = config;
  const { updateHash, getHashValues } = useHashState();
  // get style on load from hash
  const hashedStyle = getHashValues().mapStyle;

  const initStyle =
    isMapStyleKey(hashedStyle) && config.availableStyles.includes(hashedStyle)
      ? hashedStyle
      : defaultStyle;
  const [currentStyle, setCurrentStyle] = useState<MapStyleKey>(initStyle);

  useEffect(() => {
    // Update the hash state when the current style changes
    updateHash(
      // clear hash key if current style is default style
      { mapStyle: currentStyle === defaultStyle ? undefined : currentStyle },
      { label: "MapStyleProvider" }
    );
  }, [currentStyle, updateHash, defaultStyle]);

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
