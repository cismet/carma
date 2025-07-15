import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  Dispatch,
  SetStateAction,
  useEffect,
} from "react";
import { type Cartesian3 } from "cesium";

import { normalizeOptions } from "@carma-commons/utils";

import { useCesiumViewer } from "../contexts/CesiumViewerContext";

import { useCesiumPointQuery } from "./hooks/useCesiumPointQuery";
import { useCesiumPointVisualizer } from "./hooks/useCesiumPointVisualizer";
import { useCesiumTraverseQuery } from "./hooks/useCesiumTraverseQuery";
import { useCesiumTraverseVisualizer } from "./hooks/useCesiumTraverseVisualizer";
import { useCesiumMousePosition } from "./hooks/useCesiumMousePosition";
import { useMeasurementPersistence } from "./hooks/useMeasurementPersistence";

import {
  isPointMeasurementEntry,
  isTraverseMeasurementEntry,
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
  temporaryMode: boolean;
  setTemporaryMode: Dispatch<SetStateAction<boolean>>;
  // per measurement type options
  pointRadius: number;
  setPointRadius: Dispatch<SetStateAction<number>>;
  heightOffset: number;
  setHeightOffset: Dispatch<SetStateAction<number>>;
  referencePoint: Cartesian3 | null;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  referenceElevation: number; // derived from referencePoint
}

const CesiumMeasurementsContext = createContext<
  CesiumMeasurementsContextType | undefined
>(undefined);

export type MeasurementProviderOptions = {
  temporary?: boolean;
  pointQueries?: {
    enabled?: boolean;
    radius?: number;
  };
  traverse?: {
    heightOffset?: number;
  };
  cartographicCRS?: "string";
  mode?: MeasurementMode;
};

const defaultOptions: MeasurementProviderOptions = {
  temporary: false,
  mode: MeasurementMode.Traverse,
};

const defaultPointQueryOptions: MeasurementProviderOptions["pointQueries"] = {
  enabled: true,
  radius: 10,
};

const defaultTraverseOptions: MeasurementProviderOptions["traverse"] = {
  heightOffset: 1.5,
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

  const traverseOptions = normalizeOptions(
    options?.traverse,
    defaultTraverseOptions
  );

  const normalizedOptions = normalizeOptions(options, defaultOptions);
  const { mode: initialMeasurementMode, temporary: initialTemporary } =
    normalizedOptions;

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    initialMeasurementMode
  );
  const [pointRadius, setPointRadius] = useState(pointQueryOptions.radius);
  const [heightOffset, setHeightOffset] = useState(
    traverseOptions.heightOffset
  );
  const [temporaryMode, setTemporaryMode] = useState(initialTemporary);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);

  // Add measurement persistence (auto-save only, manual restore)
  useMeasurementPersistence(measurements, setMeasurements);

  const [referencePoint, setReferencePoint] = useState<Cartesian3 | null>(null);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [hideMeasurementsOfType, setHideMeasurementsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());

  const referenceElevation = useMemo(() => {
    if (!referencePoint || !viewer) return 0;
    const cartographic =
      viewer.scene.globe.ellipsoid.cartesianToCartographic(referencePoint);
    return cartographic?.height ?? 0;
  }, [referencePoint, viewer]);

  // point query hooks
  useCesiumPointQuery(
    viewer,
    measurementMode === MeasurementMode.PointQuery,
    setMeasurements,
    temporaryMode,
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
    pointRadius,
    referenceElevation
  );

  const { clearTraverseQuery, isActiveTraverse, currentTraverseId } =
    useCesiumTraverseQuery(
      viewer,
      measurementMode === MeasurementMode.Traverse,
      measurements,
      setMeasurements,
      temporaryMode,
      heightOffset
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
    mousePosition,
    isActiveTraverse,
    currentTraverseId,
    referenceElevation
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

  useEffect(() => {
    if (referencePoint !== null) return;
    // if more than one point measurement is present, set the reference point to the first one
    // this includes transverse and area measurements with at least two points too.
    if (isPointMeasurementEntry(measurements[0]) && measurements.length > 1) {
      setReferencePoint(measurements[0].geometryECEF);
    } else if (
      isTraverseMeasurementEntry(measurements[0]) &&
      measurements[0].geometryECEF.length > 1
    ) {
      setReferencePoint(measurements[0].geometryECEF[0]);
    }
    console.debug(
      "[CesiumMeasurementsContext] Setting reference point to first measurement point",
      measurements[0]?.geometryECEF
    );
  }, [measurements, setReferencePoint, referencePoint]);

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
      temporaryMode,
      setTemporaryMode,
      pointRadius,
      setPointRadius,
      heightOffset,
      setHeightOffset,
      referencePoint,
      setReferencePoint,
      referenceElevation,
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
      temporaryMode,
      setTemporaryMode,
      pointRadius,
      setPointRadius,
      heightOffset,
      setHeightOffset,
      referencePoint,
      setReferencePoint,
      referenceElevation,
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
