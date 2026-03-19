import type { PointDistanceRelation } from "../types/distanceRelation";

export const hasAnyVisibleDistanceRelationLine = (
  relation: PointDistanceRelation
) =>
  Boolean(
    relation.showDirectLine ||
      relation.showVerticalLine ||
      relation.showHorizontalLine ||
      relation.showComponentLines
  );
