import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
} from "@carma-mapping/annotations/core";

import { generateDistanceToolPrimitives } from "./generateDistanceToolPrimitives";
import { generateGroundAreaToolPrimitives } from "./generateGroundAreaToolPrimitives";
import { generateNoVisualToolPrimitives } from "./generateNoVisualToolPrimitives";
import { generatePlanarAreaToolPrimitives } from "./generatePlanarAreaToolPrimitives";
import { generatePolylineToolPrimitives } from "./generatePolylineToolPrimitives";
import { generateVerticalAreaToolPrimitives } from "./generateVerticalAreaToolPrimitives";
import type {
  ToolPrimitiveGenerationResult,
  ToolPrimitiveGeneratorContext,
  ToolPrimitiveSet,
  ToolPrimitiveSetByType,
} from "./primitiveGenerator.types";

const get = (
  byToolType: ToolPrimitiveSetByType,
  toolType: keyof ToolPrimitiveSetByType
): ToolPrimitiveSet => byToolType[toolType] ?? generateNoVisualToolPrimitives();

export const generateToolPrimitives = (
  context: ToolPrimitiveGeneratorContext
): ToolPrimitiveGenerationResult => {
  const byToolType: ToolPrimitiveSetByType = {
    [SELECT_TOOL_TYPE]: generateNoVisualToolPrimitives(),
    [ANNOTATION_TYPE_POINT]: generateNoVisualToolPrimitives(),
    [ANNOTATION_TYPE_LABEL]: generateNoVisualToolPrimitives(),
    [ANNOTATION_TYPE_DISTANCE]: generateDistanceToolPrimitives(context),
    [ANNOTATION_TYPE_POLYLINE]: generatePolylineToolPrimitives(context),
    [ANNOTATION_TYPE_AREA_GROUND]: generateGroundAreaToolPrimitives(context),
    [ANNOTATION_TYPE_AREA_VERTICAL]:
      generateVerticalAreaToolPrimitives(context),
    [ANNOTATION_TYPE_AREA_PLANAR]: generatePlanarAreaToolPrimitives(context),
  };

  const distance = get(byToolType, ANNOTATION_TYPE_DISTANCE);
  const polyline = get(byToolType, ANNOTATION_TYPE_POLYLINE);
  const areaGround = get(byToolType, ANNOTATION_TYPE_AREA_GROUND);
  const areaVertical = get(byToolType, ANNOTATION_TYPE_AREA_VERTICAL);
  const areaPlanar = get(byToolType, ANNOTATION_TYPE_AREA_PLANAR);

  return {
    byToolType,
    previewEdges: [
      ...distance.previewEdges,
      ...polyline.previewEdges,
      ...areaGround.previewEdges,
      ...areaVertical.previewEdges,
      ...areaPlanar.previewEdges,
    ],
    distanceRelations: distance.distanceRelations,
    polylineMeasurements: polyline.polylineMeasurements,
    groundPolygonPreviewGroups: areaGround.groundPolygonPreviewGroups,
    verticalPolygonPreviewGroups: areaVertical.verticalPolygonPreviewGroups,
    planarPolygonPreviewGroups: areaPlanar.planarPolygonPreviewGroups,
    groundPolygonPrimitives: areaGround.groundPolygonPrimitives,
    verticalPolygonPrimitives: areaVertical.verticalPolygonPrimitives,
    planarPolygonPrimitives: areaPlanar.planarPolygonPrimitives,
    focusedPolygonGroupId: context.nodeChainPreviewModels.focusedPolygonGroupId,
    polygonAreaBadgeByGroupId:
      context.nodeChainPreviewModels.polygonAreaBadgeByGroupId,
  };
};
