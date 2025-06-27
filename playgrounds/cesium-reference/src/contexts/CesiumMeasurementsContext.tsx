import type { Viewer, Cartesian3 } from "cesium";
import React, { createContext, useContext, useState, useMemo } from "react";
import { useMeasurement, MeasurementMode } from "../hooks/useMeasurement";
import { useCesiumViewer } from "./CesiumViewerContext";
import { PointInfoData } from "../components/measurements/PointMeasurementPanel";

interface CesiumMeasurementsContextType {
  enableMeasurement: boolean;
  setEnableMeasurement: (enabled: boolean) => void;
  clearMeasurements: () => void;
  measurementCount: number;
  hasAnyMeasurementEntities: boolean;
  isMeasurementActive: boolean;
  activeMeasurementPoints: Cartesian3[];
  viewer: Viewer | null; // Added viewer to context
  searchRadius: number;
  setSearchRadius: (radius: number) => void;
  measurementMode: MeasurementMode;
  setMeasurementMode: (mode: MeasurementMode) => void;
  pointData: PointInfoData | null; // Added pointData to context
  setPointData: (data: PointInfoData | null) => void; // Added
}

const CesiumMeasurementsContext = createContext<
  CesiumMeasurementsContextType | undefined
>(undefined);

interface CesiumMeasurementsProviderProps {
  children: React.ReactNode;
}

export const CesiumMeasurementsProvider: React.FC<
  CesiumMeasurementsProviderProps
> = ({ children }) => {
  const [enableMeasurement, setEnableMeasurement] = useState(false);

  const { viewerRef } = useCesiumViewer();

  const {
    clearMeasurements,
    measurementCount,
    hasAnyMeasurementEntities,
    activeMeasurementPoints,
    isActive,
    measurementMode,
    setMeasurementMode,
    setSearchRadius,
    searchRadius,
    pointData,
    setPointData,
  } = useMeasurement(enableMeasurement);

  const contextValue = useMemo(
    () => ({
      enableMeasurement,
      setEnableMeasurement,
      clearMeasurements,
      measurementCount,
      hasAnyMeasurementEntities,
      activeMeasurementPoints,
      isMeasurementActive: isActive,
      viewer: viewerRef.current,
      searchRadius,
      setSearchRadius,
      measurementMode,
      setMeasurementMode,
      pointData,
      setPointData,
    }),
    [
      enableMeasurement,
      setEnableMeasurement,
      clearMeasurements,
      measurementCount,
      hasAnyMeasurementEntities,
      activeMeasurementPoints,
      isActive,
      viewerRef,
      searchRadius,
      setSearchRadius,
      measurementMode,
      setMeasurementMode,
      pointData,
      setPointData,
    ]
  );

  return (
    <CesiumMeasurementsContext.Provider value={contextValue}>
      {children}
    </CesiumMeasurementsContext.Provider>
  );
};

export const useCesiumMeasurements = (): CesiumMeasurementsContextType => {
  const context = useContext(CesiumMeasurementsContext);
  if (context === undefined) {
    throw new Error(
      "useCesiumMeasurements must be used within a CesiumMeasurementsProvider"
    );
  }
  return context;
};
