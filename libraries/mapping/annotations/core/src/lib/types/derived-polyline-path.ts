export type DerivedPolylinePath = {
  id: string;
  name?: string;
  nodeIds: string[];
  edgeRelationIds: string[];
  distanceMeasurementStartPointId: string | null;
  nodeHeightsMeters: number[];
  segmentLengthsMeters: number[];
  segmentLengthsCumulativeMeters: number[];
  totalLengthMeters: number;
};
