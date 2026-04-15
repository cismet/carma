import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../tools/annotation-tool-plugin.types";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { areRuntimeCoordinateListsEqual } from "../utils/runtime-coordinate-equality";
import {
  buildVerticalAreaLoopCoordinates,
  previewControllerDefaults,
  runtimeCoordinateFromCartesian,
} from "./authoring-visual-runtime";
import { createPathAuthoringController } from "./create-path-authoring-controller";
const { AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL } = ANNOTATION_TYPES;

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const POLYGON_LOOP_OVERLAY_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";

export const createVerticalAreaAuthoringController = (
  context: AnnotationToolAuthoringContext
): AnnotationToolAuthoringController | null => {
  const { scene, drafts } = context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const draftChainController = createPathAuthoringController(scene, {
    overlayLayerId: DRAFT_CHAIN_OVERLAY_LAYER_ID,
    lineId: "draft-preview-chain",
    lineColor: previewControllerDefaults.draftChainColor,
  });
  const polygonLoopController = createPathAuthoringController(scene, {
    overlayLayerId: POLYGON_LOOP_OVERLAY_LAYER_ID,
    lineId: "draft-preview-loop",
    lineColor: previewControllerDefaults.draftChainColor,
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [
    ...drafts.get(ANNOTATION_TYPE_AREA_VERTICAL).coordinates,
  ];

  const render = () => {
    const firstCorner = draftCoordinates[0] ?? null;
    if (!enabled || !firstCorner) {
      draftChainController.clear();
      polygonLoopController.clear();
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    if (!hoverCoordinate) {
      draftChainController.setState({
        lineCoordinates: [],
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
        lineCoordinates: [firstCorner, hoverCoordinate],
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
      lineCoordinates: loopCoordinates.map(runtimeCoordinateFromCartesian),
      markerCoordinates,
    });
  };

  const unsubscribe = drafts.subscribe(ANNOTATION_TYPE_AREA_VERTICAL, () => {
    const nextDraftCoordinates = drafts.get(
      ANNOTATION_TYPE_AREA_VERTICAL
    ).coordinates;
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
      polygonLoopController.destroy();
    },
  };
};
