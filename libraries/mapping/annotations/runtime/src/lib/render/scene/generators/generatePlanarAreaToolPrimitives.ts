import { ANNOTATION_TYPE_AREA_PLANAR } from "@carma-mapping/annotations/core";

import {
  buildPolygonFillPrimitives,
  resolveActiveNodeChainType,
} from "./generatorUtils";
import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitiveGenerator.types";
export const generatePlanarAreaToolPrimitives = ({
  showMeasurementGeometry,
  activeNodeChainAnnotationId,
  visiblePolygonAnnotationsForRendering,
  nodeChainPreviewModels,
}: ToolPrimitiveGeneratorContext): ToolPrimitiveSet => {
  const activeType = resolveActiveNodeChainType(
    visiblePolygonAnnotationsForRendering,
    activeNodeChainAnnotationId
  );
  const planarPolygonPreviewGroups = showMeasurementGeometry
    ? [...nodeChainPreviewModels.planarPolygonPreviewGroups]
    : [];

  return {
    ...createEmptyToolPrimitiveSet(),
    previewEdges:
      showMeasurementGeometry && activeType === ANNOTATION_TYPE_AREA_PLANAR
        ? nodeChainPreviewModels.polygonClosurePreviewEdges
        : [],
    planarPolygonPreviewGroups,
    planarPolygonPrimitives: buildPolygonFillPrimitives(
      showMeasurementGeometry,
      nodeChainPreviewModels.focusedPolygonGroupId,
      planarPolygonPreviewGroups,
      ANNOTATION_TYPE_AREA_PLANAR
    ),
  };
};
