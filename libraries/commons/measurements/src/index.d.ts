export type ActiveShape = null | number | string | any;
export enum MEASUREMENT_MODE {
  DEFAULT = "default",
  MEASUREMENT = "measurement",
}

export type MeasurementMapStatus =
  | "INACTIVE" // not active
  | "WAITING" // moving around not dragging anything and waiting for other stuff
  | "DRAWING" // either lines or polygons but in the process
  | "EDITING" // dragging vertices around
  | "MOVING"; // dragging whole objects around

export interface MapMeasurementsContextType {
  mode: MEASUREMENT_MODE;
  setMode: (mode: MEASUREMENT_MODE) => void;
  shapes: any[];
  setShapes: (shapes: any[]) => void;
  activeShape: ActiveShape;
  setActiveShape: (shape: ActiveShape) => void;
  visibleShapes: any[];
  setVisibleShapes: (shapes: any[]) => void;
  snappingLatlng?: any;
  setSnappingLatlng?: (coords: any) => void;

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
  currentDrawHandler: any;
  setCurrentDrawHandler: (handler: any) => void;
  completeCurrentShape: () => void;
  config: MeasurementConfig;
  status: MeasurementMapStatus;
  setStatus: (status: MeasurementMapStatus) => void;
}

export interface MeasurementShapeDrawing {
  shapeId: number | string;
  number: number;
  coordinates?: unknown;
  [key: string]: unknown;
}

export type UIModeType = string | "measurement" | "default";

export interface MapMeasurementProps {
  mode?: UIModeType;
  polygonActiveIcon?: string;
  polygonIcon?: string;
}

export interface MeasurementShape {
  shapeId: number | string;
  distance?: number;
  area?: number;
  customTitle?: string;
  shapeType?: "line" | "polygon" | string;
  [key: string]: unknown;
}

export interface InfoBoxMeasurementProps {
  collapsedInfoBox?: boolean;
  pixelWidth?: number;
}

export interface MeasurementTitleProps {
  title: string;
  shapeId: number | string;
  order: number;
  updateTitleMeasurementById: (shapeId: number | string, title: string) => void;
  setUpdateMeasurementStatus: (status: boolean) => void;
  isCollapsed?: boolean;
  collapsedContent?: string;
  editable?: boolean;
}

export interface MeasurementControlProps {
  isActive?: boolean;
  onToggle?: () => void;
  position?: "topleft" | "topright" | "bottomleft" | "bottomright";
  order?: number;
  iconBaseUrl?: string;
  icons?: {
    active: string;
    inactive: string;
  };
  altText?: string;
  iconClassName?: string;

  // Universal features
  disabled?: boolean;
  useDisabledStyle?: boolean;
  tooltip?: string | React.ReactNode;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  className?: string;
  showInfoBox?: boolean;
}

export interface MeasurementConfig {
  editableTitle: boolean;
  infoBoxHeaderColor: string;
  localStorageKey: string;
  snappingEnabled: boolean;
  snappingOnUpdate: boolean;
  snappingQueryRadius: number;
  snappingMinZoom: number;
  snappingRadiusVisible: boolean;
  debugOutputMapStatus: boolean;
  debugOutputMapStatusPosition: { x: number; y: number };
}

export type PartialMeasurementConfig = Partial<MeasurementConfig>;
