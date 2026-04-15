import { ANNOTATION_TOOL_TYPES } from "@carma-mapping/annotations/core";
import { generateDistanceToolPrimitives } from "./generate-distance-tool-primitives";
import { generateGroundAreaToolPrimitives } from "./generate-ground-area-tool-primitives";
import { generateNoVisualToolPrimitives } from "./generate-no-visual-tool-primitives";
import { generatePlanarAreaToolPrimitives } from "./generate-planar-area-tool-primitives";
import { generatePolylineToolPrimitives } from "./generate-polyline-tool-primitives";
import { generateVerticalAreaToolPrimitives } from "./generate-vertical-area-tool-primitives";
import type {
  ToolPrimitiveGenerationResult,
  ToolPrimitiveGeneratorContext,
  ToolPrimitiveSet,
  ToolPrimitiveSetByType,
} from "./primitive-generator.types";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  SELECT: SELECT_TOOL_TYPE,
} = ANNOTATION_TOOL_TYPES;

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
