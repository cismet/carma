import { createContext, useContext, useState, ReactNode, useRef } from "react";
import {
  calculateSmallMapPosition,
  calculateBigMapPosition,
  getPositionFromUrl,
  setPositionInUrl,
} from "./mapPositionUtils";

interface MapSize {
  width: number;
  height: number;
}

interface DatasheetContextType {
  isDatasheetView: boolean;
  setIsDatasheetView: (value: boolean) => void;
  toggleDatasheetView: () => void;
  setMapSizes: (bigSize: MapSize, smallSize: MapSize, padding?: number) => void;
}

const DatasheetContext = createContext<DatasheetContextType | null>(null);

export const DatasheetProvider = ({ children }: { children: ReactNode }) => {
  const [isDatasheetView, setIsDatasheetViewState] = useState(false);
  const mapSizesRef = useRef<{
    bigSize: MapSize;
    smallSize: MapSize;
    padding: number;
  } | null>(null);

  const setMapSizes = (
    bigSize: MapSize,
    smallSize: MapSize,
    padding: number = 16
  ) => {
    mapSizesRef.current = { bigSize, smallSize, padding };
  };

  const setIsDatasheetView = (value: boolean) => {
    const sizes = mapSizesRef.current;
    const currentPosition = getPositionFromUrl();

    if (sizes && currentPosition) {
      if (value && !isDatasheetView) {
        // Transitioning to small map
        const newPosition = calculateSmallMapPosition(
          currentPosition,
          sizes.bigSize,
          sizes.smallSize,
          sizes.padding
        );
        setPositionInUrl(newPosition);
      } else if (!value && isDatasheetView) {
        // Transitioning to big map
        const newPosition = calculateBigMapPosition(
          currentPosition,
          sizes.bigSize,
          sizes.smallSize,
          sizes.padding
        );
        setPositionInUrl(newPosition);
      }
    }

    setIsDatasheetViewState(value);
  };

  const toggleDatasheetView = () => {
    setIsDatasheetView(!isDatasheetView);
  };

  return (
    <DatasheetContext.Provider
      value={{
        isDatasheetView,
        setIsDatasheetView,
        toggleDatasheetView,
        setMapSizes,
      }}
    >
      {children}
    </DatasheetContext.Provider>
  );
};

export const useDatasheet = () => {
  const context = useContext(DatasheetContext);
  if (!context) {
    throw new Error("useDatasheet must be used within a DatasheetProvider");
  }
  return context;
};
