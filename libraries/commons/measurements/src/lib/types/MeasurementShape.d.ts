export interface MeasurementShapeDrawing {
  shapeId: number | string;
  number: number;
  coordinates?: unknown;
  [key: string]: unknown;
}

export interface MeasurementShape {
  shapeId: number | string;
  distance?: number;
  area?: number;
  customTitle?: string;
  shapeType?: "line" | "polygon" | string;
  [key: string]: unknown;
}
