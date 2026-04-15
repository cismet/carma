import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitive-generator.types";

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
