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
    console.log("setActiveShape", activeShape);
  }, [activeShape]);

  const addShape = (layer: any) => {
    setShapes([...shapes, layer]);
  };

  const deleteShapeById = (shapeId: string) => {
    setShapes(shapes.filter((shape) => shape.id !== shapeId));
  };

  const deleteVisibleShapeById = (shapeId: string) => {
    setVisibleShapes(visibleShapes.filter((shape) => shape.id !== shapeId));
  };

  const updateShapeById = (
    shapeId: string,
    newCoordinates?: any,
    newDistance?: number,
    newSquare?: number | null
  ) => {
    setUpdateShape(true);
    setShapes(
      shapes.map((shape) => {
        if (shape.id === shapeId) {
          return {
            ...shape,
            coordinates: newCoordinates,
            distance: newDistance,
            area: newSquare,
          };
        } else {
          return shape;
        }
      })
    );
  };
  const setLastVisibleShapeActive = () => {
    const allShapes = shapes;
    const lastShapeId = allShapes[allShapes.length - 1]?.shapeId;
    if (lastShapeId) {
      setActiveShape(lastShapeId);
    }
  };

  const setDrawingWithLastActiveShape = () => {
    const lastActiveShape = activeShape;
    if (lastActiveShape) {
      setLastActiveShapeBeforeDrawing(lastActiveShape);
      setDrawingShape(true);
    }
  };

  const setActiveShapeIfDrawCancelled = () => {
    const lastActiveShape = lastActiveShapeBeforeDrawing;
    const visible = visibleShapes;

    if (lastActiveShape && visible[0]?.shapeId !== 55555) {
      setActiveShape(lastActiveShape);
      setDrawingShape(false);
    } else {
      setVisibleShapes([]);
    }
  };

  const toggleMeasurementMode = () => {
    if (mode === MEASUREMENT_MODE.DEFAULT) {
      setMode(MEASUREMENT_MODE.MEASUREMENT);
    } else {
      setMode(MEASUREMENT_MODE.DEFAULT);
    }
  };

  const updateAreaOfDrawing = (newArea: number) => {
    const shape = visibleShapes.map((s) => {
      if (s.shapeId === 5555) {
        return {
          ...s,
          area: newArea,
        };
      }
      return s;
    });
    setVisibleShapes(shape);
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
