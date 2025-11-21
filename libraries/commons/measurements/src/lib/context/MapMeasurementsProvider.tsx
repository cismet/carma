import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type {
  ActiveShape,
  MeasurementConfig,
  MeasurementMapStatus,
  PartialMeasurementConfig,
} from "./MapMeasurementsContext.d";
// import { MEASUREMENT_MODE } from "./MapMeasurementsContext.d";
import { MapMeasurementsContext } from "./MapMeasurementsContext";
import { setFromLocalforage, saveToLocalforage } from "../utils/helper";
import { normalizeOptions } from "@carma-commons/utils";

// Detect mobile devices
const isMobileDevice = () => {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );
  const isSmallScreen =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;
  return isMobileUA || isSmallScreen;
};

export const defaultConfig: MeasurementConfig = {
  editableTitle: true,
  infoBoxHeaderColor: "#3b82f6",
  localStorageKey: "measurementShapes",
  snappingEnabled: !isMobileDevice(), // Disable snapping on mobile
  snappingOnUpdate: false,
  snappingQueryRadius: 40,
  snappingMinZoom: 17,
  snappingRadiusVisible: false,
  debugOutputMapStatus: false,
  debugOutputMapStatusPosition: { x: 65, y: 15 },
};

export const MapMeasurementsProvider = ({
  children,
  config = {},
  snappingEnabled,
}: {
  children: React.ReactNode;
  config?: PartialMeasurementConfig;
  snappingEnabled?: boolean;
}) => {
  const [isMeasurementEnabled, setMeasurementEnabled] =
    useState<boolean>(false);

  const mergedConfig: MeasurementConfig = useMemo(() => {
    const opts = normalizeOptions(config, defaultConfig);
    if (snappingEnabled !== undefined) {
      opts.snappingEnabled = snappingEnabled;
    }
    if (isMobileDevice()) {
      opts.snappingEnabled = false;
    }
    return opts;
  }, [config, snappingEnabled]);

  const [isSnapping, setIsSnapping] = useState<boolean>(
    mergedConfig.snappingEnabled
  );

  useEffect(() => {
    setIsSnapping(mergedConfig.snappingEnabled);
  }, [mergedConfig.snappingEnabled]);

  useEffect(() => {
    console.debug("[MapMeasurementsProvider] Config initialized:", {
      isMobile: isMobileDevice(),
      snappingEnabled: mergedConfig.snappingEnabled,
      providedConfig: config,
    });
  }, []);
  const [activeShape, setActiveShape] = useState<ActiveShape>(null);
  const [shapes, setShapes] = useState<any[]>([]);
  const [visibleShapes, setVisibleShapes] = useState<any[]>([]);
  const [snappingLayers, setSnappingLayers] = useState<any[]>([]);

  // snappingLatlng should NOT trigger re-renders - use ref + callback pattern
  const snappingLatlngRef = useRef<any>(null);
  const snappingLatlngCallbacksRef = useRef<Set<(latlng: any) => void>>(
    new Set()
  );

  const setSnappingLatlng = useCallback((latlng: any) => {
    snappingLatlngRef.current = latlng;
    // Notify subscribers without triggering React re-render
    snappingLatlngCallbacksRef.current.forEach((callback) => {
      try {
        callback(latlng);
      } catch (e) {
        console.warn(
          "[MeasurementsProvider] Error in snappingLatlng callback:",
          e
        );
      }
    });
  }, []);

  const subscribeToSnappingLatlng = useCallback(
    (callback: (latlng: any) => void) => {
      snappingLatlngCallbacksRef.current.add(callback);
      return () => {
        snappingLatlngCallbacksRef.current.delete(callback);
      };
    },
    []
  );

  const [showAll, setShowAll] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);
  const [drawingShape, setDrawingShape] = useState(false);

  // Wrap setDrawingShape to log calls
  const setDrawingShapeWithLog = useCallback((value: boolean) => {
    console.warn(
      `[MapMeasurementsProvider] setDrawingShape(${value})`,
      new Error().stack
    );
    setDrawingShape(value);
  }, []);

  const [lastActiveShapeBeforeDrawing, setLastActiveShapeBeforeDrawing] =
    useState<any>(null);
  const [moveToShape, setMoveToShape] = useState<any>(null);
  const [updateShape, setUpdateShape] = useState(false);
  const [mapMovingEnd, setMapMovingEnd] = useState(false);
  const [updateTitleStatus, setUpdateTitleStatus] = useState(false);
  const [startDrawing, setStartDrawing] = useState(false);
  const [currentDrawHandler, setCurrentDrawHandler] = useState<any>(null);
  const [status, setStatus] = useState<MeasurementMapStatus>("INACTIVE");

  // DEBUG: Log Provider mount/unmount
  useEffect(() => {
    console.warn("[MapMeasurementsProvider] MOUNTED");
    return () => {
      console.error(
        "[MapMeasurementsProvider] UNMOUNTED - THIS SHOULD NOT HAPPEN DURING MEASUREMENT!"
      );
    };
  }, []);

  // Update status when mode changes
  useEffect(() => {
    if (isMeasurementEnabled) {
      setStatus("WAITING");
    } else {
      setStatus("INACTIVE");
    }
  }, [isMeasurementEnabled]);

  // Update status when drawing starts/ends
  useEffect(() => {
    if (drawingShape) {
      setStatus("DRAWING");
    } else if (isMeasurementEnabled) {
      // Only set to WAITING if not already in EDITING or MOVING state
      setStatus((currentStatus) => {
        if (currentStatus === "EDITING" || currentStatus === "MOVING") {
          return currentStatus;
        }
        return "WAITING";
      });
    }
  }, [drawingShape, isMeasurementEnabled]);

  useEffect(() => {
    setFromLocalforage(mergedConfig.localStorageKey, setShapes, []);
  }, []);

  useEffect(() => {
    saveToLocalforage(mergedConfig.localStorageKey, shapes);
  }, [shapes]);

  // useEffect(() => {
  //   console.log("xxx visibleShapes", visibleShapes);
  // }, [visibleShapes]);

  // useEffect(() => {
  //   console.log("xxx activeShape", activeShape);
  // }, [activeShape]);

  const addShape = useCallback((layer: any) => {
    setShapes((prevShapes) => [...prevShapes, layer]);
  }, []);

  const deleteShapeById = useCallback((shapeId: string) => {
    setShapes((currentShapes) =>
      currentShapes.filter((shape) => shape.shapeId !== shapeId)
    );
  }, []);

  const deleteVisibleShapeById = useCallback((shapeId: string) => {
    setVisibleShapes((currentVisibleShapes) =>
      currentVisibleShapes.filter((shape) => shape.shapeId !== shapeId)
    );
  }, []);

  const updateShapeById = useCallback(
    (
      shapeId: string,
      newCoordinates?: any,
      newDistance?: number,
      newSquare?: number | null
    ) => {
      setUpdateShape(true);
      setShapes((prevShapes) => {
        return prevShapes.map((s) => {
          if (s.shapeId === shapeId) {
            return {
              ...s,
              coordinates: newCoordinates,
              distance: newDistance,
              area: newSquare,
            };
          } else {
            return s;
          }
        });
      });
    },
    []
  );

  const setLastVisibleShapeActive = useCallback(() => {
    setShapes((currentShapes) => {
      const lastShapeId = currentShapes[currentShapes.length - 1]?.shapeId;
      if (lastShapeId) {
        setActiveShape(lastShapeId);
      }
      return currentShapes;
    });
  }, []);

  const setDrawingWithLastActiveShape = useCallback(() => {
    setActiveShape((currentActiveShape) => {
      if (currentActiveShape) {
        setLastActiveShapeBeforeDrawing(currentActiveShape);
        setDrawingShape(true);
      }
      return currentActiveShape;
    });
  }, []);

  const setActiveShapeIfDrawCancelled = useCallback(() => {
    setLastActiveShapeBeforeDrawing((lastActiveShape) => {
      setVisibleShapes((visible) => {
        if (lastActiveShape && visible[0]?.shapeId !== 55555) {
          setActiveShape(lastActiveShape);
          setDrawingShape(false);
        } else {
          return []; // Clear visible shapes
        }
        return visible;
      });
      return lastActiveShape;
    });
  }, []);

  const toggleMeasurementMode = useCallback(() => {
    if (!isMeasurementEnabled) {
      setMeasurementEnabled(true);
    } else {
      setMeasurementEnabled(false);
      setDrawingShape(false);
      setLastVisibleShapeActive();
    }
  }, [isMeasurementEnabled, setLastVisibleShapeActive]);

  // NOTE: newArea is pre-formatted string like "123.45 m²" or "1.23 km²" from calculateArea()
  const updateAreaOfDrawing = useCallback((newArea: string) => {
    setVisibleShapes((visibleShapes) => {
      const shape = visibleShapes.map((s) => {
        if (s.shapeId === 5555) {
          return {
            ...s,
            area: newArea,
          };
        }
        return s;
      });
      return shape;
    });
  }, []);

  const updateTitle = useCallback(
    (shapeId: string | number, customTitle: string) => {
      setVisibleShapes((currentVisibleShapes) => {
        const shapeFromVisible = currentVisibleShapes.find(
          (s) => s.shapeId === shapeId
        );

        if (!shapeFromVisible) return currentVisibleShapes;
        return currentVisibleShapes.map((shape) => {
          if (shape.shapeId === shapeId) {
            return {
              ...shapeFromVisible,
              customTitle,
            };
          }
          return shape;
        });
      });

      // Update all shapes - find the shape first to preserve all properties
      setShapes((currentShapes) => {
        const shapeFromAllShapes = currentShapes.find(
          (s) => s.shapeId === shapeId
        );
        if (!shapeFromAllShapes) return currentShapes;

        return currentShapes.map((shape) => {
          if (shape.shapeId === shapeId) {
            return {
              ...shapeFromAllShapes,
              customTitle,
            };
          }
          return shape;
        });
      });

      // Set update title status to trigger any necessary UI updates
      setUpdateTitleStatus(true);
    },
    []
  );

  const completeCurrentShape = useCallback(() => {
    if (
      currentDrawHandler &&
      typeof currentDrawHandler.completeShape === "function"
    ) {
      currentDrawHandler.completeShape();
    }
  }, [currentDrawHandler]);

  const contextValue = useMemo(
    () => ({
      isMeasurementEnabled,
      setMeasurementEnabled,
      shapes,
      setShapes,
      addShape,
      activeShape,
      setActiveShape,
      visibleShapes,
      setVisibleShapes,
      snappingLatlngRef,
      setSnappingLatlng,
      subscribeToSnappingLatlng,
      showAll,
      setShowAll,
      deleteAll,
      setDeleteAll,
      drawingShape,
      setDrawingShape: setDrawingShapeWithLog,
      lastActiveShapeBeforeDrawing,
      setLastActiveShapeBeforeDrawing,
      moveToShape,
      setMoveToShape,
      updateShape,
      setUpdateShape,
      mapMovingEnd,
      setMapMovingEnd,
      updateTitleStatus,
      setUpdateTitleStatus,
      startDrawing,
      setStartDrawing,
      currentDrawHandler,
      setCurrentDrawHandler,
      status,
      setStatus,
      deleteShapeById,
      deleteVisibleShapeById,
      updateShapeById,
      setLastVisibleShapeActive,
      setDrawingWithLastActiveShape,
      setActiveShapeIfDrawCancelled,
      toggleMeasurementMode,
      updateAreaOfDrawing,
      updateTitle,
      completeCurrentShape,
      isSnapping,
      setIsSnapping,
      config: mergedConfig,
      snappingLayers,
      setSnappingLayers,
    }),
    [
      isMeasurementEnabled,
      shapes,
      addShape,
      activeShape,
      visibleShapes,
      setSnappingLatlng,
      subscribeToSnappingLatlng,
      showAll,
      deleteAll,
      drawingShape,
      setDrawingShapeWithLog,
      lastActiveShapeBeforeDrawing,
      moveToShape,
      updateShape,
      mapMovingEnd,
      updateTitleStatus,
      startDrawing,
      currentDrawHandler,
      status,
      deleteShapeById,
      deleteVisibleShapeById,
      updateShapeById,
      setLastVisibleShapeActive,
      setDrawingWithLastActiveShape,
      setActiveShapeIfDrawCancelled,
      toggleMeasurementMode,
      updateAreaOfDrawing,
      updateTitle,
      completeCurrentShape,
      isSnapping,
      mergedConfig,
      snappingLayers,
    ]
  );

  return (
    <MapMeasurementsContext.Provider value={contextValue}>
      {children}
    </MapMeasurementsContext.Provider>
  );
};
