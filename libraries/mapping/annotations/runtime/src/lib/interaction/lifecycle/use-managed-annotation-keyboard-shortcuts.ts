import { useEffect } from "react";

import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  isSelectAllAnnotationKeyboardShortcut,
  isManagedAnnotationKeyboardEvent,
  resolveAnnotationCommonShortcutAction,
} from "@carma-mapping/annotations/core";

import { selectAllAnnotationIds, setSelectedAnnotationIds } from "../../store";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  type AnnotationDeleteRequestOptions,
} from "../../context/annotation-delete-confirmation";
import type {
  AnnotationToolPlugin,
  AnnotationToolSessionContext,
} from "../../registry";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type { AnnotationModeSession } from "./annotation-mode-session.types";

type UseManagedAnnotationKeyboardShortcutsOptions = {
  activePlugin: AnnotationToolPlugin | null;
  activeToolType: AnnotationToolId;
  activeToolSession: AnnotationModeSession | null;
  cancelToolId: AnnotationToolId | null;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  removeSelectedAnnotations: (options?: AnnotationDeleteRequestOptions) => void;
  removeEditedNode: () => boolean;
  clearInteractionState: () => void;
  requestFinishMeasurement: () => boolean;
  requestActivateTool: (toolId?: AnnotationToolId) => void;
  requestModeChange: (toolId: AnnotationToolId) => void;
  sessionContext: AnnotationToolSessionContext;
  setActiveToolTypeInStore: (toolId: AnnotationToolId) => void;
};

export const useManagedAnnotationKeyboardShortcuts = ({
  activePlugin,
  activeToolType,
  activeToolSession,
  cancelToolId,
  focusAdjacentAnnotationEntry,
  removeSelectedAnnotations,
  removeEditedNode,
  clearInteractionState,
  requestFinishMeasurement,
  requestActivateTool,
  requestModeChange,
  sessionContext,
  setActiveToolTypeInStore,
}: UseManagedAnnotationKeyboardShortcutsOptions) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSelectAllAnnotationKeyboardShortcut(event)) {
        const runtimeState = sessionContext.getState();
        const annotationIds = selectAllAnnotationIds(runtimeState);

        if (annotationIds.length > 0) {
          sessionContext.dispatch(setSelectedAnnotationIds(annotationIds));
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      const isManagedKeyEvent = isManagedAnnotationKeyboardEvent(event, {
        allowRepeat: true,
      });
      const commonAction = isManagedKeyEvent
        ? resolveAnnotationCommonShortcutAction(event)
        : null;

      if (
        commonAction ===
          ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL &&
        cancelToolId !== null &&
        activeToolType !== cancelToolId
      ) {
        const runtimeState = sessionContext.getState();
        activeToolSession?.discardDraft();
        if (runtimeState.annotationEntries.length > 0) {
          setActiveToolTypeInStore(cancelToolId);
        }
        clearInteractionState();
        event.preventDefault();
        return;
      }

      if (
        commonAction ===
        ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_PREVIOUS_NAVIGATION_ITEM
      ) {
        focusAdjacentAnnotationEntry(-1);
        event.preventDefault();
        return;
      }

      if (
        commonAction ===
        ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_NEXT_NAVIGATION_ITEM
      ) {
        focusAdjacentAnnotationEntry(1);
        event.preventDefault();
        return;
      }

      if (
        activePlugin?.keyboard?.onKeyDown({
          event,
          activeToolType,
          activeToolSession,
          requestFinishMeasurement,
          requestActivateTool,
          requestModeChange,
          sessionContext,
        })
      ) {
        clearInteractionState();
        return;
      }

      if (
        (commonAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.DELETE_SELECTION ||
          commonAction ===
            ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT) &&
        sessionContext.drafts.get(activeToolType).coordinates.length > 0
      ) {
        clearInteractionState();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        commonAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.DELETE_SELECTION ||
        commonAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT
      ) {
        if (removeEditedNode()) {
          clearInteractionState();
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const runtimeState = sessionContext.getState();
        const selectedAnnotationIds =
          runtimeState.selectionState.selectedAnnotationIds;

        if (selectedAnnotationIds.length > 0) {
          removeSelectedAnnotations({
            skipConfirmation: event.shiftKey,
            source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.KEYBOARD,
          });
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (
        commonAction ===
          ANNOTATION_COMMON_SHORTCUT_ACTIONS.FINISH_MEASUREMENT &&
        requestFinishMeasurement()
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activePlugin,
    activeToolSession,
    activeToolType,
    cancelToolId,
    clearInteractionState,
    focusAdjacentAnnotationEntry,
    removeEditedNode,
    removeSelectedAnnotations,
    requestFinishMeasurement,
    requestModeChange,
    requestActivateTool,
    sessionContext,
    setActiveToolTypeInStore,
  ]);
};
