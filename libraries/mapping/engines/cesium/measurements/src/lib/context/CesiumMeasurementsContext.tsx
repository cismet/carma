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
import { type Cartesian3 } from "@carma/cesium";
import { useLabelOverlay } from "@carma-providers/label-overlay";

import { normalizeOptions } from "@carma-commons/utils";
import {
  MEASUREMENT_MODE,
  useMapMeasurementsContext,
} from "@carma-commons/measurements";

import { useCesiumContext } from "@carma-mapping/engines/cesium";

import {
  useCesiumPointQuery,
  useCesiumPointVisualizer,
  useCesiumOverlaySync,
} from "../hooks";
import { useMeasurementPersistence } from "../hooks/useMeasurementPersistence";

import {
  isPointMeasurementEntry,
  type MeasurementCollection,
  MeasurementMode,
} from "../types/MeasurementTypes";

export interface CesiumMeasurementsContextType {
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
  persistenceKey?: string;
  persistenceEnabled?: boolean;
};

const defaultOptions: MeasurementProviderOptions = {
  temporary: false,
  mode: MeasurementMode.PointQuery,
  persistenceEnabled: true,
};

const defaultPointQueryOptions: MeasurementProviderOptions["pointQueries"] = {
  enabled: true,
  radius: 1,
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
  const { getScene } = useCesiumContext();
  const scene = getScene();
  const mapMeasurements = useMapMeasurementsContext();
  const requestUpdateCallback = useCesiumOverlaySync();
  const overlayContext = useLabelOverlay();

  useEffect(() => {
    if (overlayContext && overlayContext.updatePositions) {
      requestUpdateCallback(overlayContext.updatePositions);
    }
  }, [overlayContext, requestUpdateCallback]);


  const pointQueryOptions = normalizeOptions(
    options?.pointQueries,
    defaultPointQueryOptions
  );

  const traverseOptions = normalizeOptions(
    options?.traverse,
    defaultTraverseOptions
  );

  const normalizedOptions = normalizeOptions(options, defaultOptions);
  const {
    mode: initialMeasurementMode,
    temporary: initialTemporary,
    persistenceKey,
    persistenceEnabled,
  } = normalizedOptions;

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    initialMeasurementMode ?? MeasurementMode.PointQuery
  );

  const [pointRadius, setPointRadius] = useState(pointQueryOptions.radius ?? 1);
  const [heightOffset, setHeightOffset] = useState(
    traverseOptions.heightOffset ?? 1.5
  );
  const [temporaryMode, setTemporaryMode] = useState<boolean>(
    initialTemporary ?? false
  );
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);

  const isSceneReady = Boolean(scene && !scene.isDestroyed());

  useMeasurementPersistence(measurements, setMeasurements, {
    storageKey: persistenceKey,
    enabled: persistenceEnabled,
    ready: isSceneReady,
  });

  const [referencePoint, setReferencePoint] = useState<Cartesian3 | null>(null);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [hideMeasurementsOfType, setHideMeasurementsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());

  const referenceElevation = useMemo(() => {
    if (!referencePoint || !scene) return 0;
    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(referencePoint);
    return cartographic?.height ?? 0;
  }, [referencePoint, scene]);

  // point query hooks
  useCesiumPointQuery(
    scene,
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
    scene,
    measurements,
    showPoints,
    true,
    showPointLabels,
    false,
    pointRadius,
    referenceElevation
  );

  const clearAllMeasurements = useCallback(() => {
    setMeasurements([]);
    // resetVisibility
    if (hideMeasurementsOfType.size > 0) {
      setHideMeasurementsOfType(new Set());
    }
  }, [setMeasurements, hideMeasurementsOfType.size]);

  const clearMeasurementsByType = useCallback(
    (type: MeasurementMode) => {
      setMeasurements((prev) => prev.filter((m) => m.type !== type));
      // resetVisibility
      setHideMeasurementsOfType(deleteFromHideMeasurementsOfType(type));
    },
    [setMeasurements]
  );

  const clearMeasurementsByIds = useCallback(
    (ids: string[]) => {
      setMeasurements((prev) => prev.filter((m) => !ids.includes(m.id)));
    },
    [setMeasurements]
  );

  useEffect(() => {
    if (options?.mode !== undefined) {
      setMeasurementMode(options.mode);
      if (options.mode === MeasurementMode.NONE) {
        setMeasurements([]);
      }
    }
  }, [options?.mode, setMeasurementMode, setMeasurements]);

  useEffect(() => {
    if (mapMeasurements.mode === MEASUREMENT_MODE.MEASUREMENT) {
      setMeasurementMode((prev) =>
        prev === MeasurementMode.NONE ? MeasurementMode.PointQuery : prev
      );
    } else {
      setMeasurementMode(MeasurementMode.NONE);
      setMeasurements([]);
    }
  }, [mapMeasurements.mode, setMeasurementMode, setMeasurements]);

  useEffect(() => {
    if (referencePoint !== null) return;
    // if more than one point measurement is present, set the reference point to the first one
    if (
      measurements.length > 0 &&
      isPointMeasurementEntry(measurements[0]) &&
      measurements.length > 1
    ) {
      setReferencePoint(measurements[0].geometryECEF);
    }
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
