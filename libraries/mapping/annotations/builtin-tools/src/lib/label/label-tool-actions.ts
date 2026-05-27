import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type {
  AddAnnotationOptions,
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";

export const getDefaultLabelDisplayName = (
  order: number,
  prefix = "Beschriftung"
) => `${prefix} ${order}`;

export const createLabelMeasurement = ({
  toolType,
  coordinate,
  displayName,
  addAnnotation,
  linkedNodeGroupId,
  sourceToolId,
}: {
  toolType: StoredAnnotation["toolType"];
  coordinate: CesiumGeographicCoordinate;
  displayName: string;
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
  linkedNodeGroupId?: AnnotationNodeLinkId | null;
  sourceToolId?: AnnotationToolId;
}) =>
  addAnnotation(
    toolType,
    [coordinate],
    {
      displayName,
    },
    [linkedNodeGroupId ?? null],
    sourceToolId
  );
