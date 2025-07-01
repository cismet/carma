import React, { createContext, useContext, useState, useMemo } from "react";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  MeasurementMode,
} from "./types/MeasurementTypes";
import { useCesiumDistanceMeasurement } from "./hooks/useCesiumDistanceMeasurement";
import { normalizeOptions } from "@carma-commons/utils";
import useCesiumPointQuery from "./hooks/useCesiumPointQuery";
import useNivPPoints from "./hooks/useNivPPoints";
import { FESTPUNKTE_WUPPERTAL } from "@carma-commons/resources";
import useCesiumPointVisualizer from "./hooks/useCesiumPointVisualizer";

interface CesiumMeasurementsContextType {
  measurementMode: MeasurementMode;
  setMeasurementMode: (mode: MeasurementMode) => void;
  searchRadius: number;
  setSearchRadius: (radius: number) => void;
  measurements: MeasurementCollection;
  setMeasurements: (measurements: MeasurementCollection) => void;
  soloMode: boolean;
  setSoloMode: (solo: boolean) => void;
  clearAllMeasurements: () => void;
  clearPointMeasurements: () => void;
  clearMeasurementsByIds: (ids: string[]) => void;
}

const CesiumMeasurementsContext = createContext<
  CesiumMeasurementsContextType | undefined
>(undefined);

export type MeasurementProviderOptions = {
  soloMode?: boolean;
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

  const soloModeInit = options?.soloMode ?? true;

  const heightReference = verticalDatum ?? "nhn2016";

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    MeasurementMode.PointQuery
  );
  const [searchRadius, setSearchRadius] = useState(queryOptions.searchRadius);
  const [soloMode, setSoloMode] = useState(soloModeInit);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);

  const showNivPoints = true;

  const { entities } = useNivPPoints(
    viewer,
    FESTPUNKTE_WUPPERTAL,
    showNivPoints,
    heightReference
  );

  useCesiumPointQuery(
    viewer,
    measurementMode === MeasurementMode.PointQuery,
    setMeasurements,
    searchRadius,
    entities,
    soloMode
  );

  useCesiumPointVisualizer(
    viewer,
    measurements.filter(isPointMeasurementEntry)
  );

  const clearAllMeasurements = () => {
    setMeasurements([]);
  };

  const clearPointMeasurements = () => {
    setMeasurements((prev) => prev.filter((m) => !isPointMeasurementEntry(m)));
  };

  const clearMeasurementsByIds = (ids: string[]) => {
    setMeasurements((prev) =>
      prev.filter((m) => !ids.includes(m.id))
    );
  };

  const contextValue = useMemo(
    () => ({
      measurements,
      setMeasurements,
      measurementMode,
      setMeasurementMode,
      searchRadius,
      setSearchRadius,
      soloMode,
      setSoloMode,
      clearAllMeasurements,
      clearPointMeasurements,
      clearMeasurementsByIds,
    }),
    [
      measurements,
      setMeasurements,
      measurementMode,
      setMeasurementMode,
      soloMode,
      setSoloMode,
      searchRadius,
      setSearchRadius,
      clearAllMeasurements,
      clearPointMeasurements,
      clearMeasurementsByIds,
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
