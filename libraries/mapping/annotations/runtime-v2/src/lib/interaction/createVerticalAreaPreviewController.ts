import type {
  AnnotationToolPreviewController,
  AnnotationToolPreviewContext,
  AnnotationToolPreviewSample,
} from "../tools/annotationToolPlugin.types";
import { getDraftCoordinatesForTool } from "../store";
import { ANNOTATION_TYPE_AREA_VERTICAL } from "@carma-mapping/annotations/core";

import { createDraftChainPreviewController } from "./createDraftChainPreviewController";
import { createPolygonLoopPreviewController } from "./createPolygonLoopPreviewController";
import {
  buildVerticalAreaLoopCoordinates,
  coordinatesEqual,
  runtimeCoordinateFromCartesian,
} from "./previewController.shared";

export const createVerticalAreaPreviewController = (
  context: AnnotationToolPreviewContext
): AnnotationToolPreviewController | null => {
  const { scene, annotationsStore } = context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const draftChainController = createDraftChainPreviewController(scene);
  const polygonLoopController = createPolygonLoopPreviewController(scene);
  let enabled = false;
  let hoverSample: AnnotationToolPreviewSample | null = null;
  let draftCoordinates = [
    ...getDraftCoordinatesForTool(
      annotationsStore.getState().draftState,
      ANNOTATION_TYPE_AREA_VERTICAL
    ),
  ];

  const render = () => {
    const firstCorner = draftCoordinates[0] ?? null;
    if (!enabled || !firstCorner) {
      draftChainController.clear();
      polygonLoopController.clear();
      return;
    }

    const hoverCoordinate = hoverSample?.coordinate ?? null;
    if (!hoverCoordinate) {
      draftChainController.setState({
        chainCoordinates: [],
        markerCoordinates: [firstCorner],
      });
      polygonLoopController.clear();
      return;
    }

    const loopCoordinates = buildVerticalAreaLoopCoordinates({
      firstCorner,
      oppositeCorner: hoverCoordinate,
    });

    if (!loopCoordinates) {
      draftChainController.setState({
        chainCoordinates: [firstCorner, hoverCoordinate],
        markerCoordinates: [firstCorner, hoverCoordinate],
      });
      polygonLoopController.clear();
      return;
    }

    const markerCoordinates = [
      firstCorner,
      ...loopCoordinates.slice(1, 4).map(runtimeCoordinateFromCartesian),
    ];

    draftChainController.clear();
    polygonLoopController.setState({
      loopCoordinates: loopCoordinates.map(runtimeCoordinateFromCartesian),
      markerCoordinates,
    });
  };

  const unsubscribe = annotationsStore.subscribe(() => {
    const nextDraftCoordinates = getDraftCoordinatesForTool(
      annotationsStore.getState().draftState,
      ANNOTATION_TYPE_AREA_VERTICAL
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
