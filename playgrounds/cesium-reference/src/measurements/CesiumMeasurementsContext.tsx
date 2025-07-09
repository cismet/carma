import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";

import { normalizeOptions } from "@carma-commons/utils";

import { useCesiumViewer } from "../contexts/CesiumViewerContext";

import { useCesiumPointQuery } from "./hooks/useCesiumPointQuery";
import { useCesiumPointVisualizer } from "./hooks/useCesiumPointVisualizer";
import { useCesiumTraverseQuery } from "./hooks/useCesiumTraverseQuery";
import { useCesiumTraverseVisualizer } from "./hooks/useCesiumTraverseVisualizer";
import { useCesiumMousePosition } from "./hooks/useCesiumMousePosition";

import {
  type MeasurementCollection,
  MeasurementMode,
} from "./types/MeasurementTypes";
interface CesiumMeasurementsContextType {
  measurementMode: MeasurementMode;
  setMeasurementMode: Dispatch<SetStateAction<MeasurementMode>>;
  measurements: MeasurementCollection;
  setMeasurements: Dispatch<SetStateAction<MeasurementCollection>>;
  // utility functions
  clearAllMeasurements: () => void;
  clearMeasurementsByIds: (ids: string[]) => void;
  clearMeasurementsByType: (type: MeasurementMode) => void;
  // visibility options
  showLabels: boolean;
  setShowLabels: Dispatch<SetStateAction<boolean>>;
  hideMeasurementsOfType: Set<MeasurementMode>;
  setHideMeasurementsOfType: Dispatch<SetStateAction<Set<MeasurementMode>>>;
  hideLabelsOfType: Set<MeasurementMode>;
  setHideLabelsOfType: Dispatch<SetStateAction<Set<MeasurementMode>>>;
  // generic options
  soloMode: boolean;
  setSoloMode: Dispatch<SetStateAction<boolean>>;
  // per measurement type options
  pointRadius: number;
  setPointRadius: Dispatch<SetStateAction<number>>;
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
  cartographicCRS?: "string";
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

  const mousePosition = useCesiumMousePosition(
    viewer,
    measurementMode === MeasurementMode.Traverse
  );

  const showTraverse = !hideMeasurementsOfType.has(MeasurementMode.Traverse);
  const showTraverseLabels =
    showTraverse &&
    showLabels &&
    !hideLabelsOfType.has(MeasurementMode.Traverse);

  useCesiumTraverseVisualizer(
    viewer,
    measurements,
    showTraverse,
    showTraverseLabels,
    mousePosition
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
