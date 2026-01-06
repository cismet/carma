export interface MeasurementShapeData {
  coordinates: number[][];
  options: {
    color: string;
    fillColor: string | null;
    opacity: number;
    weight: number;
  };
  shapeId: number | string | symbol;
  distance: string;
  number: number;
  area?: string | null;
  shapeType: "line" | "polygon";
  customTitle?: string;
}
