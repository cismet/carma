import { useMemo } from "react";

import { type PlanarPolygonGroup } from "../types/AnnotationTypes";
import { type PointMarkerBadge } from "./areaPreviewModel.types";

export const useAreaPreviewSharedModel = ({
  planarPolygonGroups,
  pointMarkerBadgeByPointId,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointMarkerBadgeByPointId?: Readonly<Record<string, PointMarkerBadge>>;
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
}) => {
  const polygonAreaBadgeByGroupId = useMemo(() => {
    const byGroupId: Record<string, PointMarkerBadge> = {};
    planarPolygonGroups.forEach((group) => {
      const firstVertexPointId = group.vertexPointIds[0] ?? null;
      if (!firstVertexPointId) return;
      const badge = pointMarkerBadgeByPointId?.[firstVertexPointId];
      const badgeText = badge?.text?.trim();
      if (!badgeText) return;
      byGroupId[group.id] = {
        text: badgeText,
        backgroundColor: badge?.backgroundColor,
        textColor: badge?.textColor,
      };
    });
    return byGroupId;
  }, [planarPolygonGroups, pointMarkerBadgeByPointId]);

  const focusedPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;

  return {
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
  };
};
