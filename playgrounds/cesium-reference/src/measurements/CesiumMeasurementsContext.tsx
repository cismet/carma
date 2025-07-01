import type { Viewer, Cartesian3 } from "cesium";
import React, { createContext, useContext, useState, useMemo } from "react";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import {
  MeasurementCollection,
  MeasurementEntry,
  MeasurementMode,
  PointInfoData,
} from "./types/MeasurementTypes";
import { useCesiumDistanceMeasurement } from "./hooks/useCesiumDistanceMeasurement";
import { normalizeOptions } from "@carma-commons/utils";
import useCesiumPointQuery from "./hooks/useCesiumPointQuery";
import useNivPPoints from "./hooks/useNivPPoints";
import { FESTPUNKTE_WUPPERTAL } from "@carma-commons/resources";

interface CesiumMeasurementsContextType {
  measurementMode: MeasurementMode;
  setMeasurementMode: (mode: MeasurementMode) => void;
  searchRadius: number;
  setSearchRadius: (radius: number) => void;
  measurements: MeasurementCollection;
  setMeasurements: (measurements: MeasurementCollection) => void;
}

const CesiumMeasurementsContext = createContext<
  CesiumMeasurementsContextType | undefined
>(undefined);

export type MeasurementProviderOptions = {
  pointQueries?: {
    enabled?: boolean;
    searchRadius?: number;
  };
};

const defaultPointQueryOptions: MeasurementProviderOptions["pointQueries"] = {
  enabled: true,
  searchRadius: 10,
};

interface CesiumMeasurementsProviderProps {
  children: React.ReactNode;
  verticalDatum?: "nhn2016" | "nhn" | "nn";
  options?: MeasurementProviderOptions;
}

export const CesiumMeasurementsProvider: React.FC<
  CesiumMeasurementsProviderProps
> = ({ children, verticalDatum, options }) => {
  const { viewer } = useCesiumViewer();

  const queryOptions = normalizeOptions(
    options?.pointQueries,
    defaultPointQueryOptions
  );

  const heightReference = verticalDatum ?? "nhn2016";

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    MeasurementMode.PointQuery
  );
  const [searchRadius, setSearchRadius] = useState(queryOptions.searchRadius);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);

  const measurementCount = measurements.length;
  const showNivPoints = true;

  const { entities } = useNivPPoints(
    viewer,
    FESTPUNKTE_WUPPERTAL,
    showNivPoints,
    heightReference
  );

  const { clearPoints, showPoints, hidePoints } = useCesiumPointQuery(
    viewer,
    measurementMode === MeasurementMode.PointQuery,
    setMeasurements,
    searchRadius,
    entities
  );

  const contextValue = useMemo(
    () => ({
      measurementMode,
      setMeasurementMode,
      clearPoints,
      measurementCount,
      searchRadius,
      setSearchRadius,
      measurements,
      setMeasurements,
    }),
    [
      clearPoints,
      measurements,
      setMeasurements,
      measurementCount,
      measurementMode,
      searchRadius,
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
