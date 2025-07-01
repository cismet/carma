import type { Viewer, Cartesian3 } from "cesium";
import React, { createContext, useContext, useState, useMemo } from "react";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import { PointInfoData } from "./types/MeasurementTypes";
import { useCesiumDistanceMeasurement } from "./hooks/useCesiumDistanceMeasurement";
import { type } from "../../../../libraries/appframeworks/portals/src/index";
import { P } from "vitest/dist/reporters-yx5ZTtEV.js";

export enum MeasurementMode {
  NONE = null,
  PointQuery = "point",
  Distance = "distance",
  Elevation = "elevation",
}

export type MeasurementEntry = {
  id: string;
  type: MeasurementMode;
  timestamp: number;
  name: string;
  geometryECEF: Cartesian3[] | Cartesian3;
  geometryWGS84: {
    longitude: number;
    latitude: number;
    height: number;
  };
  metadata: PointInfoData | null;
};

export type MeasurementCollection = MeasurementEntry[];

interface CesiumMeasurementsContextType {
  clearMeasurements: () => void;
  isMeasurementActive: boolean;
  measurementCount: number;
  hasAnyMeasurementEntities: boolean;
  activeMeasurementPoints: Cartesian3[];
  measurementMode: MeasurementMode;
  setMeasurementMode: (mode: MeasurementMode) => void;
  searchRadius: number;
  setSearchRadius: (radius: number) => void;
  pointData: PointInfoData | null;
  setPointData: (data: PointInfoData | null) => void;
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
  const { viewerRef } = useCesiumViewer();
  const viewer = viewerRef.current;

  const [measurementMode, setMeasurementMode] = useState(
    MeasurementMode.PointQuery
  );
  const [searchRadius, setSearchRadius] = useState(10);
  const [pointData, setPointData] = useState<PointInfoData | null>(null);
  const [measurementCollection, setMeasurementCollection] = useState<
    MeasurementEntry[]
  >([]);

  const measurementCount = measurementCollection.length;

  const {
    clearMeasurements,
    isActive,
    hasAnyMeasurementEntities,
    activeMeasurementPoints,
  } = useCesiumDistanceMeasurement(
    viewer,
    measurementMode === MeasurementMode.Distance
  );

  const {
    clearMeasurements,
    isActive,
    hasAnyMeasurementEntities,
    activeMeasurementPoints,
  } = useCesiumPointQuery(
    viewerRef.current,
    measurementMode === MeasurementMode.PointQuery,
    nivPEntities,
    searchRadius,
    handleShowInfo
  );

  const contextValue = useMemo(
    () => ({
      clearMeasurements,
      isMeasurementActive: isActive,
      measurementCount,
      hasAnyMeasurementEntities,
      activeMeasurementPoints,
      measurementMode,
      setMeasurementMode,
      searchRadius,
      setSearchRadius,
      pointData,
      setPointData,
    }),
    [
      clearMeasurements,
      isActive,
      measurementCount,
      hasAnyMeasurementEntities,
      activeMeasurementPoints,
      measurementMode,
      searchRadius,
      pointData,
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
