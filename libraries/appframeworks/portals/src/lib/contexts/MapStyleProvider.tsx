import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useHashState } from "./HashStateProvider";

export type MapStyle = string;

export interface MapStyleConfig {
  defaultStyle: MapStyle;
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
  const { defaultStyle } = config;
  const { updateHash, getHashValues } = useHashState();
  // get style on load from hash
  const hashedStyle = getHashValues().mapStyle;
  const initStyle =
    typeof hashedStyle === "string" &&
    config.availableStyles.includes(hashedStyle)
      ? hashedStyle
      : defaultStyle;
  const [currentStyle, setCurrentStyle] = useState<MapStyle>(initStyle);

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
