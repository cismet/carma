export type DerivedPolylinePath = {
  id: string;
  name?: string;
  vertexPointIds: string[];
  edgeRelationIds: string[];
  distanceMeasurementStartPointId: string | null;
  vertexHeightsMeters: number[];
  segmentLengthsMeters: number[];
  segmentLengthsCumulativeMeters: number[];
  totalLengthMeters: number;
};
