import { getVector3Centroid } from "@carma-commons/math";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  type AnnotationGeographicCoordinate,
  type AnnotationTypes,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { formatAreaSquareMetersAdaptive } from "@carma-units";

import type { AnnotationToolAuthoringContext } from "../registry";
import type { AuthoringAreaLabelAnchor } from "./authoring-area-label";

/** The summed area of the rings and the centroid of their corners. */
export const buildPolygonPreviewAreaLabel = ({
  toolType,
  coordinateRings,
  formatOptions,
}: {
  toolType: AnnotationTypes["AREA_GROUND"] | AnnotationTypes["AREA_PLANAR"];
  coordinateRings: readonly (readonly AnnotationGeographicCoordinate[])[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): AuthoringAreaLabelAnchor | null => {
  const validCoordinateRings = coordinateRings.filter(
    (coordinates) => coordinates.length >= 3
  );
  if (validCoordinateRings.length === 0) {
    return null;
  }

  const derivedAreaSquareMeters = validCoordinateRings.reduce(
    (sum, coordinates, ringIndex) => {
      const coordinateEntries = coordinates.map(
        (coordinate, coordinateIndex) =>
          [
            `preview-area-node-${ringIndex}-${coordinateIndex}`,
            ecefFromGeographicCoordinate(coordinate),
          ] as const
      );
      const derivedMeasurement = computePolygonGroupDerivedData(
        {
          id: `preview-area-measurement-${ringIndex}`,
          type: toolType,
          nodeIds: coordinateEntries.map(([nodeId]) => nodeId),
          edgeRelationIds: [],
          closed: true,
          planeLocked: toolType === ANNOTATION_TYPES.AREA_PLANAR,
        } satisfies NodeChainAnnotation,
        new Map(coordinateEntries)
      );

      return sum + Math.max(0, derivedMeasurement.areaSquareMeters ?? 0);
    },
    0
  );
  const anchorECEF = getVector3Centroid(
    validCoordinateRings.flatMap((coordinates) =>
      coordinates.map((coordinate) => ecefFromGeographicCoordinate(coordinate))
    )
  );

  return anchorECEF
    ? {
        text: formatAreaSquareMetersAdaptive(
          derivedAreaSquareMeters,
          formatOptions.areaSquareMeters
        ),
        anchorECEF,
      }
    : null;
};
