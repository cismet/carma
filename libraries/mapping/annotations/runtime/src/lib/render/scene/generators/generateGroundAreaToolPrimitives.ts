import { ANNOTATION_TYPE_AREA_GROUND } from "@carma-mapping/annotations/core";

import {
  buildPolygonFillPrimitives,
  resolveActiveNodeChainType,
} from "./generatorUtils";
import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitiveGenerator.types";

export const generateGroundAreaToolPrimitives = ({
  showMeasurementGeometry,
  activeNodeChainAnnotationId,
  visiblePolygonAnnotationsForRendering,
  nodeChainPreviewModels,
}: ToolPrimitiveGeneratorContext): ToolPrimitiveSet => {
  const activeType = resolveActiveNodeChainType(
    visiblePolygonAnnotationsForRendering,
    activeNodeChainAnnotationId
  );
  const groundPolygonPreviewGroups = showMeasurementGeometry
    ? [...nodeChainPreviewModels.groundPolygonPreviewGroups]
    : [];

  return {
    ...createEmptyToolPrimitiveSet(),
    previewEdges:
      showMeasurementGeometry && activeType === ANNOTATION_TYPE_AREA_GROUND
        ? nodeChainPreviewModels.polygonClosurePreviewEdges
        : [],
    groundPolygonPreviewGroups,
    groundPolygonPrimitives: buildPolygonFillPrimitives(
      showMeasurementGeometry,
      nodeChainPreviewModels.focusedPolygonGroupId,
      groundPolygonPreviewGroups,
      ANNOTATION_TYPE_AREA_GROUND
    ),
  };
};
