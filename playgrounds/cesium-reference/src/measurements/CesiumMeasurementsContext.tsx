import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  Dispatch,
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
import { s } from "node_modules/vite/dist/node/types.d-aGj9QkWt";

interface CesiumMeasurementsContextType {
  measurementMode: MeasurementMode;
  setMeasurementMode: (mode: MeasurementMode) => void;
  measurements: MeasurementCollection;
  setMeasurements: (measurements: MeasurementCollection) => void;
  // utility functions
  clearAllMeasurements: () => void;
  clearMeasurementsByIds: (ids: string[]) => void;
  clearMeasurementsByType: (type: MeasurementMode) => void;
  // visibility options
  showLabels: boolean;
  setShowLabels: Dispatch<boolean>;
  hideMeasurementsOfType: Set<MeasurementMode>;
  setHideMeasurementsOfType: Dispatch<Set<MeasurementMode>>;
  hideLabelsOfType: Set<MeasurementMode>;
  setHideLabelsOfType: Dispatch<Set<MeasurementMode>>;
  // generic options
  coordinateDisplayMode: CoordinateDisplayMode;
  setCoordinateDisplayMode: Dispatch<CoordinateDisplayMode>;
  soloMode: boolean;
  setSoloMode: Dispatch<boolean>;
  // per measurement type options
  pointRadius: number;
  setPointRadius: Dispatch<number>;
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

const deleteFromHideMeasurementsOfType =
  (type: MeasurementMode) => (prev: Set<MeasurementMode>) => {
    // prevent rerenders on non-changes
    if (!prev.has(type)) return prev;
    const newSet = new Set(prev);
    newSet.delete(type);
    return newSet;
  };

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
    MeasurementMode.PointQuery
  );
  const [pointRadius, setPointRadius] = useState(pointQueryOptions.radius);
  const [soloMode, setSoloMode] = useState(soloModeInit);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [hideMeasurementsOfType, setHideMeasurementsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());

  // point query hooks

  useCesiumPointQuery(
    viewer,
    measurementMode === MeasurementMode.PointQuery,
    setMeasurements,
    soloMode,
    pointRadius
  );

  const showPoints = !hideMeasurementsOfType.has(MeasurementMode.PointQuery);
  const showPointLabels =
    showPoints &&
    showLabels &&
    !hideLabelsOfType.has(MeasurementMode.PointQuery);

  console.debug(
    "xxx",
    showPoints,
    showPointLabels,
    hideMeasurementsOfType,
    hideLabelsOfType
  );

  useCesiumPointVisualizer(
    viewer,
    measurements,
    showPoints,
    showPointLabels,
    pointRadius
  );

  const { clearTraverseQuery } = useCesiumTraverseQuery(
    viewer,
    measurementMode === MeasurementMode.Traverse,
    setMeasurements,
    soloMode
  );

  const clearAllMeasurements = useCallback(() => {
    setMeasurements([]);
    clearTraverseQuery();
    // resetVisibility
    if (hideMeasurementsOfType.size > 0) {
      setHideMeasurementsOfType(new Set());
    }
    // intentionally not checking for size here, as we want to reset the set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMeasurements, clearTraverseQuery]);

  const clearMeasurementsByType = useCallback(
    (type: MeasurementMode) => {
      setMeasurements((prev) => prev.filter((m) => m.type !== type));
      // resetVisibility
      setHideMeasurementsOfType(deleteFromHideMeasurementsOfType(type));
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
      showLabels,
      setShowLabels,
      hideMeasurementsOfType,
      setHideMeasurementsOfType,
      hideLabelsOfType,
      setHideLabelsOfType,
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
      showLabels,
      setShowLabels,
      hideMeasurementsOfType,
      setHideMeasurementsOfType,
      hideLabelsOfType,
      setHideLabelsOfType,
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
