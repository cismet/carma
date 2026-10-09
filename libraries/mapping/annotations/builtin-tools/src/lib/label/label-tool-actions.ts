import type {
  AnnotationToolId,
  AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";
import type {
  AddAnnotationOptions,
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
  coordinate: AnnotationGeographicCoordinate;
  displayName: string;
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly AnnotationGeographicCoordinate[],
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
