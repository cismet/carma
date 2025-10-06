import { createContext, useContext, useEffect, useState } from "react";
export type ActiveShape = null | number | string | any;
export enum MEASUREMENT_MODE {
  DEFAULT = "default",
  MEASUREMENT = "measurement",
}
export interface MapMeasurementsContextType {
  mode: MEASUREMENT_MODE;
  setMode: (mode: MEASUREMENT_MODE) => void;
  shapes: any[];
  setShapes: (shapes: any[]) => void;
  activeShape: ActiveShape;
  setActiveShape: (shape: ActiveShape) => void;
  visibleShapes: any[];
  setVisibleShapes: (shapes: any[]) => void;

  showAll: boolean;
  deleteAll: boolean;
  drawingShape: boolean;
  lastActiveShapeBeforeDrawing: null | any;
  moveToShape: null | any;
  updateShape: boolean;
  mapMovingEnd: boolean;
  updateTitleStatus: boolean;
  setDrawingShape: (drawingShape: boolean) => void;
  setShowAll: (showAll: boolean) => void;
  setDeleteAll: (deleteAll: boolean) => void;
  setMoveToShape: (moveToShape: any) => void;
  setUpdateShape: (updateShape: boolean) => void;
  setMapMovingEnd: (mapMovingEnd: boolean) => void;
  setUpdateTitleStatus: (updateTitleStatus: boolean) => void;
  setLastActiveShapeBeforeDrawing: (lastActiveShapeBeforeDrawing: any) => void;
  addShape: (layer: any) => void;
  deleteShapeById: (shapeId: string) => void;
  deleteVisibleShapeById: (shapeId: string) => void;
  updateShapeById: (
    shapeId: string,
    newCoordinates?: any,
    newDistance?: number,
    newSquare?: number | null
  ) => void;
  setLastVisibleShapeActive: () => void;
  setDrawingWithLastActiveShape: () => void;
  setActiveShapeIfDrawCancelled: () => void;
  toggleMeasurementMode: () => void;
  updateAreaOfDrawing: (newArea: number) => void;
  updateTitle: (shapeId: string | number, customTitle: string) => void;
  setStartDrawing: (status: boolean) => void;
  startDrawing: boolean;
}
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
  }
);

export const MapMeasurementsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [mode, setMode] = useState<MEASUREMENT_MODE>(MEASUREMENT_MODE.DEFAULT);
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
  const [startDrawing, setStartDrawing] = useState(false);

  useEffect(() => {
    console.log("xxx shapes", shapes);
  }, [shapes]);

  useEffect(() => {
    console.log("xxx visibleShapes", visibleShapes);
  }, [visibleShapes]);

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
      return currentShapes; // No change to shapes, just accessing fresh state
    });
  };

  const setDrawingWithLastActiveShape = () => {
    setActiveShape((currentActiveShape) => {
      if (currentActiveShape) {
        setLastActiveShapeBeforeDrawing(currentActiveShape);
        setDrawingShape(true);
      }
      return currentActiveShape; // No change, just accessing fresh state
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
        return visible; // No change if condition not met
      });
      return lastActiveShape; // No change, just accessing fresh state
    });
  };

  const toggleMeasurementMode = () => {
    if (mode === MEASUREMENT_MODE.DEFAULT) {
      setMode(MEASUREMENT_MODE.MEASUREMENT);
    } else {
      setMode(MEASUREMENT_MODE.DEFAULT);
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
    // Update visible shapes - find the shape first to preserve all properties
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
