import type {
  NodeChainAnnotation,
  PolygonPreviewGroup,
} from "@carma-mapping/annotations/core";

import type { PolygonPrimitiveRenderModel } from "../visualization.types";
import { getPolygonFillColor, type FillMeasurementType } from "../../fill";

export const resolveActiveNodeChainType = (
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  activeNodeChainAnnotationId: string | null
): NodeChainAnnotation["type"] | null => {
  if (!activeNodeChainAnnotationId) {
    return null;
  }

  return (
    nodeChainAnnotations.find(
      (group) => group.id === activeNodeChainAnnotationId
    )?.type ?? null
  );
};

export const buildPolygonFillPrimitives = (
  enabled: boolean,
  focusedPolygonGroupId: string | null,
  polygonPreviewGroups: readonly PolygonPreviewGroup[],
  type: FillMeasurementType
): readonly PolygonPrimitiveRenderModel[] =>
  (enabled ? polygonPreviewGroups : []).map(({ group, vertexPoints }) => ({
    id: group.id,
    vertexPoints,
    fillColor: getPolygonFillColor(type, group.id === focusedPolygonGroupId),
  }));
