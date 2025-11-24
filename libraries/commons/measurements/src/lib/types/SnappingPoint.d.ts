export type SnappingPoint = {
  coordinates: [number, number]; // [lng, lat]
  sourceId: string;
  distance?: number; // Calculated later
  metadata?: {
    featureId?: string;
    shapeId?: string | number;
    geometryType?: string;
  };
};
