import type {
  AddAnnotationOptions,
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "../../store";

export const getDefaultLabelDisplayName = (order: number) =>
  `Beschriftung ${order}`;

export const createLabelMeasurement = ({
  toolType,
  coordinate,
  displayName,
  addAnnotation,
  linkedNodeGroupId,
}: {
  toolType: StoredAnnotation["toolType"];
  coordinate: CesiumGeographicCoordinate;
  displayName: string;
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[]
  ) => StoredAnnotation;
  linkedNodeGroupId?: AnnotationNodeLinkId | null;
}) =>
  addAnnotation(
    toolType,
    [coordinate],
    {
      displayName,
    },
    [linkedNodeGroupId ?? null]
  );
