import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import {
  CoordinateDisplayMode,
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
  measurements: MeasurementCollection;
  setMeasurements: (measurements: MeasurementCollection) => void;
  // utility functions
  clearAllMeasurements: () => void;
  clearMeasurementsByIds: (ids: string[]) => void;
  clearMeasurementsByType: (type: MeasurementMode) => void;
  // generic options
  coordinateDisplayMode: CoordinateDisplayMode;
  setCoordinateDisplayMode: (mode: CoordinateDisplayMode) => void;
  soloMode: boolean;
  setSoloMode: (solo: boolean) => void;
  // per measurement type options
  pointRadius: number;
  setPointRadius: (radius: number) => void;
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
  const [coordinateDisplayMode, setCoordinateDisplayMode] =
    useState<CoordinateDisplayMode>(CoordinateDisplayMode.UTM32);

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    MeasurementMode.Traverse
  );
  const [pointRadius, setPointRadius] = useState(pointQueryOptions.radius);
  const [soloMode, setSoloMode] = useState(soloModeInit);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);

  // point query hooks

  useCesiumPointQuery(
    viewer,
    measurementMode === MeasurementMode.PointQuery,
    setMeasurements,
    soloMode,
    pointRadius
  );

  useCesiumPointVisualizer(viewer, measurements, pointRadius);

  const { clearTraverseQuery } = useCesiumTraverseQuery(
    viewer,
    measurementMode === MeasurementMode.Traverse,
    setMeasurements,
    soloMode
  );

  const clearAllMeasurements = useCallback(() => {
    setMeasurements([]);
    clearTraverseQuery();
  }, [setMeasurements, clearTraverseQuery]);

  const clearMeasurementsByType = useCallback(
    (type: MeasurementMode) => {
      setMeasurements((prev) => prev.filter((m) => m.type !== type));
      if (type === MeasurementMode.Traverse) {
        clearTraverseQuery();
      }
    },
    [setMeasurements, clearTraverseQuery]
  );

  const clearMeasurementsByIds = useCallback(
    (ids: string[]) => {
      setMeasurements((prev) => prev.filter((m) => !ids.includes(m.id)));
    },
    [setMeasurements]
  );

  const contextValue = useMemo(
    () => ({
      measurementMode,
      setMeasurementMode,
      measurements,
      setMeasurements,
      clearAllMeasurements,
      clearMeasurementsByIds,
      clearMeasurementsByType,
      coordinateDisplayMode,
      setCoordinateDisplayMode,
      soloMode,
      setSoloMode,
      pointRadius,
      setPointRadius,
    }),
    [
      measurementMode,
      setMeasurementMode,
      measurements,
      setMeasurements,
      clearAllMeasurements,
      clearMeasurementsByIds,
      clearMeasurementsByType,
      coordinateDisplayMode,
      setCoordinateDisplayMode,
      soloMode,
      setSoloMode,
      pointRadius,
      setPointRadius,
    ]
  );

  return (
    <CesiumMeasurementsContext.Provider value={contextValue}>
      {children}
    </CesiumMeasurementsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCesiumMeasurements = (): CesiumMeasurementsContextType => {
  const context = useContext(CesiumMeasurementsContext);
  if (context === undefined) {
    throw new Error(
      "useCesiumMeasurements must be used within a CesiumMeasurementsProvider"
    );
  }
  return context;
};
