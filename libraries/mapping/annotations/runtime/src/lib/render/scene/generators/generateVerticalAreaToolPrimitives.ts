import { ANNOTATION_TYPE_AREA_VERTICAL } from "@carma-mapping/annotations/core";

import {
  buildPolygonFillPrimitives,
  resolveActiveNodeChainType,
} from "./generatorUtils";
import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitiveGenerator.types";
export const generateVerticalAreaToolPrimitives = ({
  showMeasurementGeometry,
  activeNodeChainAnnotationId,
  visiblePolygonAnnotationsForRendering,
  nodeChainPreviewModels,
}: ToolPrimitiveGeneratorContext): ToolPrimitiveSet => {
  const activeType = resolveActiveNodeChainType(
    visiblePolygonAnnotationsForRendering,
    activeNodeChainAnnotationId
  );
  const verticalPolygonPreviewGroups = showMeasurementGeometry
    ? [...nodeChainPreviewModels.verticalPolygonPreviewGroups]
    : [];

  return {
    ...createEmptyToolPrimitiveSet(),
    previewEdges:
      showMeasurementGeometry && activeType === ANNOTATION_TYPE_AREA_VERTICAL
        ? nodeChainPreviewModels.polygonClosurePreviewEdges
        : [],
    verticalPolygonPreviewGroups,
    verticalPolygonPrimitives: buildPolygonFillPrimitives(
      showMeasurementGeometry,
      nodeChainPreviewModels.focusedPolygonGroupId,
      verticalPolygonPreviewGroups,
      ANNOTATION_TYPE_AREA_VERTICAL
    ),
  };
};
