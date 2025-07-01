import React, { createContext, useContext, useState, useMemo } from "react";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import {
  MeasurementCollection,
  MeasurementMode,
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
  singleMode: boolean;
  setSingleMode: (singleMode: boolean) => void;
}

const CesiumMeasurementsContext = createContext<
  CesiumMeasurementsContextType | undefined
>(undefined);

export type MeasurementProviderOptions = {
  singleMode?: boolean;
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

  const singleModeDefault = options?.singleMode ?? true;

  const heightReference = verticalDatum ?? "nhn2016";

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    MeasurementMode.PointQuery
  );
  const [searchRadius, setSearchRadius] = useState(queryOptions.searchRadius);
  const [singleMode, setSingleMode] = useState(singleModeDefault);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);

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
    entities,
    singleMode
  );

  const contextValue = useMemo(
    () => ({
      measurements,
      setMeasurements,
      measurementMode,
      setMeasurementMode,
      searchRadius,
      setSearchRadius,
      singleMode,
      setSingleMode,
      clearPoints,
    }),
    [
      measurements,
      setMeasurements,
      measurementMode,
      setMeasurementMode,
      singleMode,
      setSingleMode,
      searchRadius,
      setSearchRadius,
      clearPoints,
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
