import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type {
  ActiveShape,
  MeasurementConfig,
  MeasurementMapStatus,
  PartialMeasurementConfig,
} from "./MapMeasurementsContext.d";
// import { MEASUREMENT_MODE } from "./MapMeasurementsContext.d";
import { MapMeasurementsContext } from "./MapMeasurementsContext";
import { setFromLocalforage, saveToLocalforage } from "../utils/storage";
import { normalizeOptions } from "@carma-commons/utils";
import { DRAWING_SHAPE_ID } from "../utils/constants";

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
  snappingIdentityDistanceMeters: 0.1, // 10cm - points closer than this are considered identical
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

  const [showAll, setShowAll] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);
  const [drawingShape, setDrawingShape] = useState(false);

  const [lastActiveShapeBeforeDrawing, setLastActiveShapeBeforeDrawing] =
    useState<any>(null);
  const [moveToShape, setMoveToShape] = useState<any>(null);
  const [updateShape, setUpdateShape] = useState(false);
  const [mapMovingEnd, setMapMovingEnd] = useState(false);
  const [updateTitleStatus, setUpdateTitleStatus] = useState(false);

  // DEBUG: Log Provider mount/unmount
  useEffect(() => {
    console.warn("[MapMeasurementsProvider] MOUNTED");
    return () => {
      console.error(
        "[MapMeasurementsProvider] UNMOUNTED - THIS SHOULD NOT HAPPEN DURING MEASUREMENT!"
      );
    };
  }, []);

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
        if (lastActiveShape && visible[0]?.shapeId !== DRAWING_SHAPE_ID) {
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
      console.debug("[MapMeasurementsProvider] Enabling measurement mode");
      setMeasurementEnabled(true);
    } else {
      console.debug("[MapMeasurementsProvider] Disabling measurement mode");
      setMeasurementEnabled(false);
      setDrawingShape(false);
      setLastVisibleShapeActive();
    }
  }, [isMeasurementEnabled, setLastVisibleShapeActive]);

  // NOTE: newArea is pre-formatted string like "123.45 m²" or "1.23 km²" from calculateArea()
  const updateAreaOfDrawing = useCallback((newArea: string) => {
    setVisibleShapes((visibleShapes) => {
      const shape = visibleShapes.map((s) => {
        if (s.shapeId === DRAWING_SHAPE_ID) {
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
      isSnapping,
      setIsSnapping,
      config: mergedConfig,
    }),
    [
      isMeasurementEnabled,
      shapes,
      addShape,
      activeShape,
      visibleShapes,
      showAll,
      deleteAll,
      drawingShape,
      lastActiveShapeBeforeDrawing,
      moveToShape,
      updateShape,
      mapMovingEnd,
      updateTitleStatus,
      deleteShapeById,
      deleteVisibleShapeById,
      updateShapeById,
      setLastVisibleShapeActive,
      setDrawingWithLastActiveShape,
      setActiveShapeIfDrawCancelled,
      toggleMeasurementMode,
      updateAreaOfDrawing,
      updateTitle,
      isSnapping,
      mergedConfig,
    ]
  );

  return (
    <MapMeasurementsContext.Provider value={contextValue}>
      {children}
    </MapMeasurementsContext.Provider>
  );
};
