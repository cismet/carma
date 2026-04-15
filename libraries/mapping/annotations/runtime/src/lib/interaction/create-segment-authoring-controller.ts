import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../tools/annotation-tool-plugin.types";
import type { RuntimeToolId } from "../types/runtime-tool.types";
import { areRuntimeCoordinateListsEqual } from "../utils/runtime-coordinate-equality";
import { createPathAuthoringController } from "./create-path-authoring-controller";
import { createSegmentGuideController } from "./create-segment-guide-controller";
import { previewControllerDefaults } from "./authoring-visual-runtime";

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";

export const createSegmentAuthoringController = ({
  toolType,
  context,
  showCommittedDraftChain,
}: {
  toolType: RuntimeToolId;
  context: AnnotationToolAuthoringContext;
  showCommittedDraftChain: boolean;
}): AnnotationToolAuthoringController | null => {
  const { scene, drafts } = context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const draftChainController = createPathAuthoringController(scene, {
    overlayLayerId: DRAFT_CHAIN_OVERLAY_LAYER_ID,
    lineId: "draft-preview-chain",
    lineColor: previewControllerDefaults.draftChainColor,
  });
  const segmentController = createSegmentGuideController(scene, {
    formatOptions: context.formatOptions,
    previewLineLabelVisualOptions: context.previewLineLabelVisualOptions,
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [...drafts.get(toolType).coordinates];

  const render = () => {
    if (!enabled) {
      draftChainController.clear();
      segmentController.clear();
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const markerCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];

    draftChainController.setState({
      lineCoordinates: showCommittedDraftChain ? draftCoordinates : [],
      markerCoordinates,
    });
    segmentController.setSegment(
      draftCoordinates[draftCoordinates.length - 1] ?? null,
      hoverCoordinate
    );
  };

  const unsubscribe = drafts.subscribe(toolType, () => {
    const nextDraftCoordinates = drafts.get(toolType).coordinates;
    if (
      areRuntimeCoordinateListsEqual(draftCoordinates, nextDraftCoordinates)
    ) {
      return;
    }

    draftCoordinates = [...nextDraftCoordinates];
    render();
  });

  render();

  return {
    setEnabled: (nextEnabled) => {
      enabled = nextEnabled;
      if (!enabled) {
        pointQueryPickResult = null;
      }
      render();
    },
    setPointQueryPickResult: (pickResult) => {
      pointQueryPickResult = pickResult;
      render();
    },
    destroy: () => {
      unsubscribe();
      draftChainController.destroy();
      segmentController.destroy();
    },
  };
};
