import type { Viewer, Cartesian3 } from "cesium";
import React, { createContext, useContext, useState, useMemo } from "react";
import useMeasurement from "../hooks/useMeasurement";
import { useCesiumViewer } from "./CesiumViewerContext";

interface CesiumMeasurementsContextType {
  enableMeasurement: boolean;
  setEnableMeasurement: (enabled: boolean) => void;
  clearMeasurements: () => void;
  measurementCount: number;
  hasAnyMeasurementEntities: boolean;
  isMeasurementActive: boolean;
  activeMeasurementPoints: Cartesian3[];
  viewer: Viewer | null; // Added viewer to context
}

const CesiumMeasurementsContext =
  createContext<CesiumMeasurementsContextType | undefined>(undefined);

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
    }),
    [
      enableMeasurement,
      setEnableMeasurement,
      clearMeasurements,
      measurementCount,
      hasAnyMeasurementEntities,
      activeMeasurementPoints,
      isActive,
      viewerRef.current,    ]
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
