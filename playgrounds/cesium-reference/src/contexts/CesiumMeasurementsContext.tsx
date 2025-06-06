import type { Viewer, Cartesian3 } from "cesium";
import React, { createContext, useContext, useState, useMemo } from "react";
import useMeasurement from "../hooks/useMeasurement";

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
  viewer: Viewer | null;
}

export const CesiumMeasurementsProvider: React.FC<
  CesiumMeasurementsProviderProps
> = ({ children, viewer }) => {
  const [enableMeasurement, setEnableMeasurement] = useState(false);
  const {
    clearMeasurements,
    measurementCount,
    hasAnyMeasurementEntities,
    isMeasurementActive,
    activeMeasurementPoints,
  } = useMeasurement(viewer, enableMeasurement);

  const contextValue = useMemo(
    () => ({
      enableMeasurement,
      setEnableMeasurement,
      clearMeasurements,
      measurementCount,
      hasAnyMeasurementEntities,
      isMeasurementActive,
      activeMeasurementPoints,
      viewer, // Provide viewer through context
    }),
    [
      enableMeasurement,
      setEnableMeasurement,
      clearMeasurements,
      measurementCount,
      hasAnyMeasurementEntities,
      isMeasurementActive,
      activeMeasurementPoints,
      viewer, // Add viewer to dependency array
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
