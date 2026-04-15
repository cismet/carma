import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../tools/annotation-tool-plugin.types";
import type { RuntimeCoordinate } from "../store";
import type { RuntimeToolId } from "../types/runtime-tool.types";
import { areRuntimeCoordinateListsEqual } from "../utils/runtime-coordinate-equality";
import { previewControllerDefaults } from "./authoring-visual-runtime";
import { createPathAuthoringController } from "./create-path-authoring-controller";

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const POLYGON_LOOP_OVERLAY_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";

const buildClosedLoopCoordinates = (
  coordinates: readonly RuntimeCoordinate[]
): readonly RuntimeCoordinate[] => {
  if (coordinates.length < 3) {
    return [];
  }

  return [...coordinates, coordinates[0]!];
};

export const createPolygonAuthoringController = ({
  toolType,
  context,
}: {
  toolType: RuntimeToolId;
  context: AnnotationToolAuthoringContext;
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
  const polygonLoopController = createPathAuthoringController(scene, {
    overlayLayerId: POLYGON_LOOP_OVERLAY_LAYER_ID,
    lineId: "draft-preview-loop",
    lineColor: previewControllerDefaults.draftChainColor,
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [...drafts.get(toolType).coordinates];

  const render = () => {
    if (!enabled || draftCoordinates.length === 0) {
      draftChainController.clear();
      polygonLoopController.clear();
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const previewCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];

    draftChainController.setState({
      lineCoordinates: previewCoordinates,
      markerCoordinates: previewCoordinates,
    });
    polygonLoopController.setState({
      lineCoordinates: buildClosedLoopCoordinates(previewCoordinates),
      markerCoordinates: [],
    });
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
      polygonLoopController.destroy();
    },
  };
};
