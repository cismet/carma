import { buildCandidatePreviewEdgeRenderModels } from "../../edge/build-edge-scene-line-render-models";
import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitive-generator.types";
export const generateDistanceToolPrimitives = ({
  showMeasurementGeometry,
  candidateConnectionPreview,
  effectiveDistanceRelationsForRendering,
}: ToolPrimitiveGeneratorContext): ToolPrimitiveSet => {
  if (!showMeasurementGeometry) {
    return createEmptyToolPrimitiveSet();
  }

  return {
    ...createEmptyToolPrimitiveSet(),
    previewEdges: buildCandidatePreviewEdgeRenderModels({
      candidateConnection: candidateConnectionPreview,
    }),
    distanceRelations: [...effectiveDistanceRelationsForRendering],
  };
};
