import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import {
  isPointMeasurementEntry,
  isTraverseMeasurementEntry,
  MeasurementCollection,
  MeasurementMode,
} from "./types/MeasurementTypes";
import { normalizeOptions } from "@carma-commons/utils";
import { useCesiumPointQuery } from "./hooks/useCesiumPointQuery";
import { useCesiumPointVisualizer } from "./hooks/useCesiumPointVisualizer";
import { useCesiumTraverseQuery } from "./hooks/useCesiumTraverseQuery";

interface CesiumMeasurementsContextType {
  measurementMode: MeasurementMode;
  setMeasurementMode: (mode: MeasurementMode) => void;
  pointRadius: number;
  setPointRadius: (radius: number) => void;
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
    radius?: number;
  };
};

const defaultPointQueryOptions: MeasurementProviderOptions["pointQueries"] = {
  enabled: true,
  radius: 10,
};

interface CesiumMeasurementsProviderProps {
  children: React.ReactNode;
  options?: MeasurementProviderOptions;
}

export const CesiumMeasurementsProvider: React.FC<
  CesiumMeasurementsProviderProps
> = ({ children, options }) => {
  const { viewer } = useCesiumViewer();

  const pointQueryOptions = normalizeOptions(
    options?.pointQueries,
    defaultPointQueryOptions
  );

  const soloModeInit = options?.soloMode ?? true;

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    MeasurementMode.PointQuery
  );
  const [pointRadius, setPointRadius] = useState(pointQueryOptions.radius);
  const [soloMode, setSoloMode] = useState(soloModeInit);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);

  useCesiumPointQuery(
    viewer,
    measurementMode === MeasurementMode.PointQuery,
    setMeasurements,
    soloMode,
    pointRadius
  );

  useCesiumTraverseQuery(
    viewer,
    measurementMode === MeasurementMode.Traverse,
    setMeasurements,
    soloMode
  );

  useCesiumPointVisualizer(
    viewer,
    measurements.filter(isPointMeasurementEntry),
    pointRadius
  );

  const clearAllMeasurements = useCallback(() => {
    setMeasurements([]);
  }, [setMeasurements]);

  const clearPointMeasurements = useCallback(() => {
    setMeasurements((prev) => prev.filter((m) => !isPointMeasurementEntry(m)));
  }, [setMeasurements]);

  const clearTraversalMeasurements = useCallback(() => {
    setMeasurements((prev) =>
      prev.filter((m) => isTraverseMeasurementEntry(m))
    );
  }, [setMeasurements]);

  const clearMeasurementsByIds = useCallback(
    (ids: string[]) => {
      setMeasurements((prev) => prev.filter((m) => !ids.includes(m.id)));
    },
    [setMeasurements]
  );

  const contextValue = useMemo(
    () => ({
      measurements,
      setMeasurements,
      measurementMode,
      setMeasurementMode,
      pointRadius,
      setPointRadius,
      soloMode,
      setSoloMode,
      clearAllMeasurements,
      clearPointMeasurements,
      clearTraversalMeasurements,
      clearMeasurementsByIds,
    }),
    [
      measurements,
      setMeasurements,
      measurementMode,
      setMeasurementMode,
      soloMode,
      setSoloMode,
      pointRadius,
      setPointRadius,
      clearAllMeasurements,
      clearPointMeasurements,
      clearTraversalMeasurements,
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
