import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  type AnnotationToolId,
  resolveAnnotationCommonShortcutAction,
} from "@carma-mapping/annotations/core";
import {
  RUNTIME_POLYGON_FILL_PLACEMENT,
  type AnnotationToolPlugin,
  type AreaOcclusionStyleOptions,
} from "@carma-mapping/annotations/runtime";
import { undoAreaPreviewPoint } from "../area-shared/node-chain-area-tool-actions";
import {
  buildNodeChainAreaToolRenderModels,
  createNodeChainAreaToolVisuals,
} from "../area-shared/node-chain-area-tool-render-models";
import { toolType } from "./area-planar-tool-config";

export const createAreaPlanarToolKeyboard = ({
  toolId,
}: {
  toolId: AnnotationToolId;
}): NonNullable<AnnotationToolPlugin["keyboard"]> => ({
  onKeyDown: ({ event, activeToolSession, sessionContext }) => {
    const shortcutAction = resolveAnnotationCommonShortcutAction(event);
    if (
      shortcutAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL
    ) {
      activeToolSession?.discardDraft();
      event.preventDefault();
      return true;
    }

    if (shortcutAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT) {
      const currentDraft = sessionContext.drafts.get(toolId);
      if (currentDraft.coordinates.length === 0) {
        return false;
      }

      sessionContext.drafts.set(toolId, {
        coordinates: undoAreaPreviewPoint(currentDraft.coordinates),
        linkedNodeGroupIds: undoAreaPreviewPoint(
          currentDraft.linkedNodeGroupIds
        ),
        feedback: null,
      });
      event.preventDefault();
      return true;
    }

    return false;
  },
});

export const createAreaPlanarToolVisualModels = ({
  renderStoredPlanarAnnotations,
  areaPlanarToolVisuals,
  resolvedOcclusionStyleOptions,
}: {
  renderStoredPlanarAnnotations: boolean;
  areaPlanarToolVisuals: ReturnType<typeof createNodeChainAreaToolVisuals>;
  resolvedOcclusionStyleOptions: AreaOcclusionStyleOptions;
}): NonNullable<AnnotationToolPlugin["visualModels"]> => ({
  build: ({
    nodes,
    annotationEntries,
    selectedAnnotationIds,
    setSelectedAnnotationId,
    formatOptions,
    onNodeLongPress,
  }) => {
    if (!renderStoredPlanarAnnotations) {
      return null;
    }

    return buildNodeChainAreaToolRenderModels({
      toolType,
      visuals: areaPlanarToolVisuals,
      nodes,
      annotations: annotationEntries,
      selectedAnnotationIds: selectedAnnotationIds,
      fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
      formatOptions,
      onSelect: setSelectedAnnotationId,
      onNodeLongPress,
      occlusionStyleOptions: resolvedOcclusionStyleOptions,
    });
  },
});
