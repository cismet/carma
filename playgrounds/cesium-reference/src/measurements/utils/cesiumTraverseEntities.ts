import { Cartesian3, Color, Entity, HeightReference } from "cesium";
import {
  isTraverseMeasurementEntry,
  MeasurementCollection,
} from "../types/MeasurementTypes";

export const createPointMarker = (
  position: Cartesian3,
  id?: string
): Entity => {
  return new Entity({
    id: id || `measurement-point-marker-${Date.now()}`,
    position: position,
    point: {
      pixelSize: 11,
      color: Color.WHITESMOKE,
      outlineColor: Color.BLACK,
      outlineWidth: 0,
      heightReference: HeightReference.NONE,
      //disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
};

export const removeNodeFromTraverseByTraverseId = (
  setMeasurements: (
    value:
      | MeasurementCollection
      | ((prev: MeasurementCollection) => MeasurementCollection)
  ) => void,
  id: string,
  nodeIndex: number
) => {
  setMeasurements((prev: MeasurementCollection) => {
    return prev.map((measurement) => {
      if (measurement.id === id && isTraverseMeasurementEntry(measurement)) {
        const newGeometry = [...measurement.geometryECEF];
        newGeometry.splice(nodeIndex, 1);

        // Update geographic coordinates by removing the corresponding point
        const newGeographicPoints = [...measurement.geometryWGS84];
        newGeographicPoints.splice(nodeIndex, 1);

        // Recalculate derived data for the modified traverse
        const { segmentLengths, segmentLengthsCumulative, totalLength } =
          calculateSegmentLengths(newGeometry);

        return {
          ...measurement,
          geometryECEF: newGeometry,
          geometryWGS84: newGeographicPoints,
          derived: {
            segmentLengths,
            segmentLengthsCumulative,
            totalLength,
          },
          shouldRebuildEntry: true, // Flag to indicate entry needs to be rebuilt
          timestamp: Date.now(), // Update timestamp to trigger re-rendering
        };
      }
      return measurement;
    });
  });
};

export const calculateSegmentLengths = (
  points: Cartesian3[]
): {
  segmentLengths: number[];
  segmentLengthsCumulative: number[];
  totalLength: number;
} => {
  const segmentLengths: number[] = [0]; // First point has no segment
  const segmentLengthsCumulative: number[] = [0];
  let totalLength = 0;

  for (let i = 1; i < points.length; i++) {
    const segmentLength = Cartesian3.distance(points[i], points[i - 1]);
    segmentLengths[i] = segmentLength;
    totalLength += segmentLength;
    segmentLengthsCumulative[i] = totalLength;
  }

  return { segmentLengths, segmentLengthsCumulative, totalLength };
};
