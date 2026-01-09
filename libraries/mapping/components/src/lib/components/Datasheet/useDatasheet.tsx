import { createContext, useContext, useState, ReactNode, useRef } from "react";
import { utils } from "@carma-appframeworks/portals";
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
  setIsDatasheetView: (
    value: boolean,
    feature?: any,
    routedMapRef?: any
  ) => void;
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

  const setIsDatasheetView = (
    value: boolean,
    feature?: any,
    routedMapRef?: any
  ) => {
    const sizes = mapSizesRef.current;
    const currentPosition = getPositionFromUrl();
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;

    if (value && feature && leafletMap) {
      setTimeout(() => {
        utils.zoomToFeature(feature, leafletMap);
      }, 550);
    } else if (sizes && currentPosition) {
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
