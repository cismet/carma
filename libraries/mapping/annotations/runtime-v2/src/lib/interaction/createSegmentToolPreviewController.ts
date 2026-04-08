import type {
  AnnotationToolPreviewController,
  AnnotationToolPreviewContext,
  AnnotationToolPreviewSample,
} from "../tools/annotationToolPlugin.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";
import { getDraftCoordinatesForTool } from "../store";
import { createDraftChainPreviewController } from "./createDraftChainPreviewController";
import { createSegmentPreviewController } from "./createSegmentPreviewController";
import { coordinatesEqual } from "./previewController.shared";

export const createSegmentToolPreviewController = ({
  toolType,
  context,
  showCommittedDraftChain,
}: {
  toolType: RuntimeToolId;
  context: AnnotationToolPreviewContext;
  showCommittedDraftChain: boolean;
}): AnnotationToolPreviewController | null => {
  const { scene, annotationsStore } = context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const draftChainController = createDraftChainPreviewController(scene);
  const segmentController = createSegmentPreviewController(scene);
  let enabled = false;
  let hoverSample: AnnotationToolPreviewSample | null = null;
  let draftCoordinates = [
    ...getDraftCoordinatesForTool(annotationsStore.getState().draftState, toolType),
  ];

  const render = () => {
    if (!enabled) {
      draftChainController.clear();
      segmentController.clear();
      return;
    }

    const hoverCoordinate = hoverSample?.coordinate ?? null;
    const markerCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];

    draftChainController.setState({
      chainCoordinates: showCommittedDraftChain ? draftCoordinates : [],
      markerCoordinates,
    });
    segmentController.setSegment(
      draftCoordinates[draftCoordinates.length - 1] ?? null,
      hoverCoordinate
    );
  };

  const unsubscribe = annotationsStore.subscribe(() => {
    const nextDraftCoordinates = getDraftCoordinatesForTool(
      annotationsStore.getState().draftState,
      toolType
    );
    if (coordinatesEqual(draftCoordinates, nextDraftCoordinates)) {
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
        hoverSample = null;
      }
      render();
    },
    setHoverSample: (sample) => {
      hoverSample = sample;
      render();
    },
    destroy: () => {
      unsubscribe();
      draftChainController.destroy();
      segmentController.destroy();
    },
  };
};
