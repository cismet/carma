/**
 * Component-Specific Types
 * Types used by measurement UI components
 */

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
