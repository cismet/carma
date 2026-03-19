import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitiveGenerator.types";

export const generatePolylineToolPrimitives = ({
  showMeasurementGeometry,
  nodeChainPreviewModels,
}: ToolPrimitiveGeneratorContext): ToolPrimitiveSet => {
  if (!showMeasurementGeometry) {
    return createEmptyToolPrimitiveSet();
  }

  return {
    ...createEmptyToolPrimitiveSet(),
    previewEdges: nodeChainPreviewModels.verticalPreviewEdges,
    polylineMeasurements: [...nodeChainPreviewModels.polylineMeasurements],
  };
};
