import { createContext, useContext, useState, ReactNode, useRef } from "react";
import type maplibregl from "maplibre-gl";
import {
  calculateSmallMapPosition,
  calculateBigMapPosition,
  getPositionFromUrl,
  setPositionInUrl,
} from "./mapPositionUtils";
import { zoomToFeature } from "../../utils/utils";

interface MapSize {
  width: number;
  height: number;
}

interface DatasheetContextType {
  isDatasheetView: boolean;
  setIsDatasheetView: ({
    value,
    feature,
    routedMapRef,
    libreMap,
  }: {
    value: boolean;
    feature?: any;
    routedMapRef?: any;
    libreMap?: maplibregl.Map | null;
  }) => void;
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

  const setIsDatasheetView = ({
    value,
    feature,
    routedMapRef,
    libreMap,
  }: {
    value: boolean;
    feature?: any;
    routedMapRef?: any;
    libreMap?: maplibregl.Map | null;
  }) => {
    const sizes = mapSizesRef.current;
    const currentPosition = getPositionFromUrl();
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;

    if (value && feature && (leafletMap || libreMap)) {
      setTimeout(() => {
        zoomToFeature({
          selectedFeature: feature,
          leafletMap: leafletMap ?? undefined,
          libreMap: libreMap ?? undefined,
        });
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
    setIsDatasheetView({ value: !isDatasheetView });
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
