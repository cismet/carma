import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  buildPolygonFillPrimitives,
  resolveActiveNodeChainType,
} from "./generator-utils";
import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitive-generator.types";
const { AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL } = ANNOTATION_TYPES;

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
