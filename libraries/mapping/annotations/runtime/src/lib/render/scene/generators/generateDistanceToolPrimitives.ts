import { buildCandidatePreviewEdgeRenderModels } from "../../edge/buildEdgeSceneLineRenderModels";

import {
  createEmptyToolPrimitiveSet,
  type ToolPrimitiveGeneratorContext,
  type ToolPrimitiveSet,
} from "./primitiveGenerator.types";

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
