export interface SnappingPoint {
  coordinates: [number, number]; // [lng, lat]
  sourceId: string;
  distance?: number; // Calculated later
  metadata?: {
    featureId?: string;
    shapeId?: string | number;
    geometryType?: string;
  };
}

export interface MousePosition {
  x: number;
  y: number;
}

export interface SnappingContext {
  mousePosition: MousePosition;
  queryRadius: number;
  maplibreMap: any;
  leafletMap: any;
}
