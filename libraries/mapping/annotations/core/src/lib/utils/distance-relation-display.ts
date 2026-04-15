import type { PointDistanceRelation } from "../types/distance-relation";

export const hasAnyVisibleDistanceRelationLine = (
  relation: PointDistanceRelation
) =>
  Boolean(
    relation.showDirectLine ||
      relation.showVerticalLine ||
      relation.showHorizontalLine ||
      relation.showComponentLines
  );
