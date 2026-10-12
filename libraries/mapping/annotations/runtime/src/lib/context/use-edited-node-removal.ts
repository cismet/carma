import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AnnotationToolDraftStore } from "../registry";
import {
  removeAnnotationsByIds,
  removeNodeFromAnnotation,
  resolveNodeLinkIdForNodeId,
  type AnnotationsStore,
} from "../store";
import { ANNOTATION_DELETE_CONFIRMATION_SOURCES } from "./annotation-delete-confirmation";
import {
  resolveDraftNodeIdsAfterEditedNodeRemoval,
  resolveEditedNodeRemovalTarget,
} from "./edited-node-removal.helpers";
import type { RequestAnnotationDeleteConfirmation } from "./use-annotation-removal";

type UseEditedNodeRemovalOptions = {
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  activeEditedNodeId: string | null;
  setActiveEditedNodeId: Dispatch<SetStateAction<string | null>>;
  requestAnnotationDeleteConfirmation: RequestAnnotationDeleteConfirmation;
};

/**
 * Removes the node being edited. Returns true when the key press is handled,
 * which includes a removal still awaiting its delete confirmation.
 */
export const useEditedNodeRemoval = ({
  annotationsStore,
  annotationToolDraftStore,
  activeEditedNodeId,
  setActiveEditedNodeId,
  requestAnnotationDeleteConfirmation,
}: UseEditedNodeRemovalOptions) =>
  useCallback(() => {
    if (!activeEditedNodeId) {
      return false;
    }

    const runtimeState = annotationsStore.getState();
    const target = resolveEditedNodeRemovalTarget({
      annotationEntries: runtimeState.annotationEntries,
      selectedAnnotationIds: runtimeState.selectionState.selectedAnnotationIds,
      editedNodeId: activeEditedNodeId,
    });
    if (!target) {
      return false;
    }

    const { annotation: targetAnnotation, minimumNodeCount } = target;
    const remainingNodeIds = targetAnnotation.nodeIds.filter(
      (nodeId) => nodeId !== activeEditedNodeId
    );
    if (remainingNodeIds.length >= minimumNodeCount) {
      annotationsStore.dispatch(
        removeNodeFromAnnotation({
          annotationId: targetAnnotation.id,
          nodeId: activeEditedNodeId,
        })
      );
      setActiveEditedNodeId(null);
      return true;
    }

    const draftNodeIds = resolveDraftNodeIdsAfterEditedNodeRemoval({
      nodeIds: targetAnnotation.nodeIds,
      editedNodeId: activeEditedNodeId,
      closed: targetAnnotation.closed === true,
    });
    if (draftNodeIds.length !== remainingNodeIds.length) {
      return false;
    }

    const nodeById = new Map(
      runtimeState.nodes.map((node) => [node.id, node] as const)
    );
    const draftNodes = draftNodeIds.flatMap((nodeId) => {
      const node = nodeById.get(nodeId);
      return node ? [node] : [];
    });
    if (draftNodes.length !== draftNodeIds.length) {
      return false;
    }

    // Dropping below the minimum node count deletes the whole measurement, so
    // confirm first like the other delete paths.
    void requestAnnotationDeleteConfirmation([targetAnnotation], {
      source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.KEYBOARD,
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      // The degraded measurement stays restorable as a draft; Select mode stays
      // active so restoring does not switch to the authoring tool.
      annotationToolDraftStore.set(targetAnnotation.toolType, {
        coordinates: draftNodes.map((node) => node.coordinate),
        linkedNodeGroupIds: draftNodeIds.map((nodeId) =>
          resolveNodeLinkIdForNodeId(runtimeState.linkedNodeGroups, nodeId)
        ),
        feedback: null,
      });
      annotationsStore.dispatch(
        removeAnnotationsByIds({
          annotationIds: [targetAnnotation.id],
          nextSelectedAnnotationId: null,
        })
      );
      setActiveEditedNodeId(null);
    });
    return true;
  }, [
    activeEditedNodeId,
    annotationToolDraftStore,
    annotationsStore,
    requestAnnotationDeleteConfirmation,
    setActiveEditedNodeId,
  ]);
