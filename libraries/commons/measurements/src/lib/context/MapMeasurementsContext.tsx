import { createContext } from "react";
import type {
  ActiveShape,
  MeasurementConfig,
  MeasurementMapStatus,
} from "./MapMeasurementsContext.d";
// import { MEASUREMENT_MODE } from "./MapMeasurementsContext.d";

export interface MapMeasurementsContextType {
  isMeasurementEnabled: boolean;
  setMeasurementEnabled: (enabled: boolean) => void;
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
  // NOTE: newArea is pre-formatted string like "123.45 m²" or "1.23 km²" from calculateArea()
  updateAreaOfDrawing: (newArea: string) => void;
  updateTitle: (shapeId: string | number, customTitle: string) => void;
  config: MeasurementConfig;
  isSnapping: boolean;
  setIsSnapping: (isSnapping: boolean) => void;
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
    isMeasurementEnabled: false,
    setMeasurementEnabled: (enabled: boolean) => {},
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
    updateAreaOfDrawing: (newArea: string) => {},
    updateTitle: (shapeId: string | number, customTitle: string) => {},
    config: defaultConfig,
    isSnapping: true,
    setIsSnapping: (isSnapping: boolean) => {},
  }
);
