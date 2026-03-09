import type {
  DirectLineLabelMode,
  DistanceRelationLabelVisibilityByKind,
} from "../visualizers/distance/distanceRelationLabel.types";

export type PointDistanceRelation = {
  id: string;
  edgeId: string;
  pointAId: string;
  pointBId: string;
  anchorPointId: string;
  polygonGroupId?: string;
  showDirectLine?: boolean;
  showVerticalLine?: boolean;
  showHorizontalLine?: boolean;
  showComponentLines?: boolean;
  labelVisibilityByKind?: DistanceRelationLabelVisibilityByKind;
  directLabelMode?: DirectLineLabelMode;
};

export type PointReferenceLineAnnotation = {
  showDirectLine?: boolean;
  showComponentLines?: boolean;
};
