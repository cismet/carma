import { createContext, useContext, useEffect, useState } from "react";
import {
  ActiveShape,
  MapMeasurementsContextType,
  MeasurementConfig,
  MeasurementMapStatus,
  PartialMeasurementConfig,
} from "../../";
import { setFromLocalforage, saveToLocalforage } from "../utils/helper";

enum MEASUREMENT_MODE {
  DEFAULT = "default",
  MEASUREMENT = "measurement",
}

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

const defaultConfig: MeasurementConfig = {
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

export const MapMeasurementsContext = createContext<MapMeasurementsContextType>(
  {
    mode: MEASUREMENT_MODE.DEFAULT,
    setMode: (mode: MEASUREMENT_MODE) => {},
    shapes: [],
    setShapes: (shapes: any[]) => {},
    activeShape: null,
    setActiveShape: (shape: ActiveShape) => {},
    visibleShapes: [],
    setVisibleShapes: (shapes: any[]) => {},
    snappingLatlng: null,
    setSnappingLatlng: (_latlng: any) => {},
    showAll: false,
    deleteAll: false,
    drawingShape: false,
    lastActiveShapeBeforeDrawing: null,
    moveToShape: null,
    updateShape: false,
    mapMovingEnd: false,
    updateTitleStatus: false,
    setDrawingShape: (drawingShape: boolean) => {},
    setShowAll: (showAll: boolean) => {},
    setDeleteAll: (deleteAll: boolean) => {},
    setMoveToShape: (moveToShape: any) => {},
    setUpdateShape: (updateShape: boolean) => {},
    setMapMovingEnd: (mapMovingEnd: boolean) => {},
    setUpdateTitleStatus: (updateTitleStatus: boolean) => {},
    setLastActiveShapeBeforeDrawing: (lastActiveShapeBeforeDrawing: any) => {},
    addShape: (layer: any) => {},
    deleteShapeById: (shapeId: string) => {},
    deleteVisibleShapeById: (shapeId: string) => {},
    updateShapeById: (
      shapeId: string,
      newCoordinates?: any,
      newDistance?: number,
      newSquare?: number | null
    ) => {},
    setLastVisibleShapeActive: () => {},
    setDrawingWithLastActiveShape: () => {},
    setActiveShapeIfDrawCancelled: () => {},
    toggleMeasurementMode: () => {},
    updateAreaOfDrawing: (newArea: number) => {},
    updateTitle: (_shapeId: string | number, _customTitle: string) => {},
    setStartDrawing: (status: boolean) => {},
    startDrawing: false,
    currentDrawHandler: null,
    setCurrentDrawHandler: (handler: any) => {},
    completeCurrentShape: () => {},
    config: defaultConfig,
    status: "INACTIVE" as MeasurementMapStatus,
    setStatus: (status: MeasurementMapStatus) => {},
  }
);

export const MapMeasurementsProvider = ({
  children,
  externalMode,
  setModeExternal,
  config = {},
}: {
  children: React.ReactNode;
  externalMode?: MEASUREMENT_MODE;
  setModeExternal?: (mode: MEASUREMENT_MODE) => void;
  config?: PartialMeasurementConfig;
}) => {
  // Internal mode state as fallback when external props not provided
  const [internalMode, setInternalMode] = useState<MEASUREMENT_MODE>(
    MEASUREMENT_MODE.DEFAULT
  );

  // Use external mode/setMode if provided, otherwise use internal state
  const mode = externalMode ?? internalMode;
  const setMode = setModeExternal ?? setInternalMode;

  // Merge provided config with defaults
  // Force disable snapping on mobile devices regardless of config
  const mergedConfig: MeasurementConfig = {
    ...defaultConfig,
    ...config,
    snappingEnabled: isMobileDevice()
      ? false
      : config.snappingEnabled ?? defaultConfig.snappingEnabled,
  };
  const [activeShape, setActiveShape] = useState<ActiveShape>(null);
  const [shapes, setShapes] = useState<any[]>([]);
  const [visibleShapes, setVisibleShapes] = useState<any[]>([]);
  const [snappingLatlng, setSnappingLatlng] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);
  const [drawingShape, setDrawingShape] = useState(false);
  const [lastActiveShapeBeforeDrawing, setLastActiveShapeBeforeDrawing] =
    useState<any>(null);
  const [moveToShape, setMoveToShape] = useState<any>(null);
  const [updateShape, setUpdateShape] = useState(false);
  const [mapMovingEnd, setMapMovingEnd] = useState(false);
  const [updateTitleStatus, setUpdateTitleStatus] = useState(false);
  const [startDrawing, setStartDrawing] = useState(false);
  const [currentDrawHandler, setCurrentDrawHandler] = useState<any>(null);
  const [status, setStatus] = useState<MeasurementMapStatus>("INACTIVE");

  // Update status when mode changes
  useEffect(() => {
    if (mode === MEASUREMENT_MODE.MEASUREMENT) {
      setStatus("WAITING");
    } else {
      setStatus("INACTIVE");
    }
  }, [mode]);

  // Update status when drawing starts/ends
  useEffect(() => {
    if (drawingShape) {
      setStatus("DRAWING");
    } else if (mode === MEASUREMENT_MODE.MEASUREMENT) {
      // Only set to WAITING if not already in EDITING or MOVING state
      setStatus((currentStatus) => {
        if (currentStatus === "EDITING" || currentStatus === "MOVING") {
          return currentStatus;
        }
        return "WAITING";
      });
    }
  }, [drawingShape, mode]);

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

  const addShape = (layer: any) => {
    setShapes((prevShapes) => [...prevShapes, layer]);
  };

  const deleteShapeById = (shapeId: string) => {
    setShapes((currentShapes) =>
      currentShapes.filter((shape) => shape.shapeId !== shapeId)
    );
  };

  const deleteVisibleShapeById = (shapeId: string) => {
    setVisibleShapes((currentVisibleShapes) =>
      currentVisibleShapes.filter((shape) => shape.shapeId !== shapeId)
    );
  };

  const updateShapeById = (
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
  };

  const setLastVisibleShapeActive = () => {
    setShapes((currentShapes) => {
      const lastShapeId = currentShapes[currentShapes.length - 1]?.shapeId;
      if (lastShapeId) {
        setActiveShape(lastShapeId);
      }
      return currentShapes;
    });
  };

  const setDrawingWithLastActiveShape = () => {
    setActiveShape((currentActiveShape) => {
      if (currentActiveShape) {
        setLastActiveShapeBeforeDrawing(currentActiveShape);
        setDrawingShape(true);
      }
      return currentActiveShape;
    });
  };

  const setActiveShapeIfDrawCancelled = () => {
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
  };

  const toggleMeasurementMode = () => {
    if (mode === MEASUREMENT_MODE.DEFAULT) {
      setMode(MEASUREMENT_MODE.MEASUREMENT);
    } else {
      setMode(MEASUREMENT_MODE.DEFAULT);
      setDrawingShape(false);
      setLastVisibleShapeActive();
    }
  };

  const updateAreaOfDrawing = (newArea: number) => {
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
  };

  const updateTitle = (shapeId: string | number, customTitle: string) => {
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
  };

  const completeCurrentShape = () => {
    if (
      currentDrawHandler &&
      typeof currentDrawHandler.completeShape === "function"
    ) {
      currentDrawHandler.completeShape();
    }
  };

  return (
    <MapMeasurementsContext.Provider
      value={{
        mode,
        setMode,
        shapes,
        setShapes,
        addShape,
        activeShape,
        setActiveShape,
        visibleShapes,
        setVisibleShapes,
        snappingLatlng,
        setSnappingLatlng,
        showAll,
        setShowAll,
        deleteAll,
        setDeleteAll,
        drawingShape,
        setDrawingShape,
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
        deleteShapeById,
        deleteVisibleShapeById,
        updateShapeById,
        setLastVisibleShapeActive,
        setDrawingWithLastActiveShape,
        setActiveShapeIfDrawCancelled,
        toggleMeasurementMode,
        updateAreaOfDrawing,
        updateTitle,
        setStartDrawing,
        startDrawing,
        currentDrawHandler,
        setCurrentDrawHandler,
        completeCurrentShape,
        config: mergedConfig,
        status,
        setStatus,
      }}
    >
      {children}
    </MapMeasurementsContext.Provider>
  );
};

export function useMapMeasurementsContext() {
  const ctx = useContext(MapMeasurementsContext);
  if (!ctx) {
    throw new Error(
      "useMapMeasurementsContext must be used within an MapMeasurementsProvider"
    );
  }
  return ctx;
}
