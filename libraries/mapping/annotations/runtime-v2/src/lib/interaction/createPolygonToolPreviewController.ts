import type {
  AnnotationToolPreviewController,
  AnnotationToolPreviewContext,
  AnnotationToolPreviewSample,
} from "../tools/annotationToolPlugin.types";
import type { RuntimeCoordinate } from "../store";
import { getDraftCoordinatesForTool } from "../store";
import type { RuntimeToolId } from "../types/runtimeTool.types";
import { createDraftChainPreviewController } from "./createDraftChainPreviewController";
import { createPolygonLoopPreviewController } from "./createPolygonLoopPreviewController";
import { coordinatesEqual } from "./previewController.shared";

const buildClosedLoopCoordinates = (
  coordinates: readonly RuntimeCoordinate[]
): readonly RuntimeCoordinate[] => {
  if (coordinates.length < 3) {
    return [];
  }

  return [...coordinates, coordinates[0]!];
};

export const createPolygonToolPreviewController = ({
  toolType,
  context,
}: {
  toolType: RuntimeToolId;
  context: AnnotationToolPreviewContext;
}): AnnotationToolPreviewController | null => {
  const { scene, annotationsStore } = context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const draftChainController = createDraftChainPreviewController(scene);
  const polygonLoopController = createPolygonLoopPreviewController(scene);
  let enabled = false;
  let hoverSample: AnnotationToolPreviewSample | null = null;
  let draftCoordinates = [
    ...getDraftCoordinatesForTool(annotationsStore.getState().draftState, toolType),
  ];

  const render = () => {
    if (!enabled || draftCoordinates.length === 0) {
      draftChainController.clear();
      polygonLoopController.clear();
      return;
    }

    const hoverCoordinate = hoverSample?.coordinate ?? null;
    const visibleCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];
    const previewCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];

    draftChainController.setState({
      chainCoordinates: previewCoordinates,
      markerCoordinates: visibleCoordinates,
    });
    polygonLoopController.setState({
      loopCoordinates: buildClosedLoopCoordinates(previewCoordinates),
      markerCoordinates: [],
    });
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
      polygonLoopController.destroy();
    },
  };
};
