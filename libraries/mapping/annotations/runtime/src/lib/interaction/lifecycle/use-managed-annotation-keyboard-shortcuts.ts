import { useEffect } from "react";

import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  isSelectAllAnnotationKeyboardShortcut,
  isManagedAnnotationKeyboardEvent,
  resolveAnnotationCommonShortcutAction,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  removeAnnotationsByIds,
  resolveRemovableSelectedAnnotationIds,
  selectAllAnnotationIds,
  setSelectedAnnotationIds,
} from "../../store";
import type {
  AnnotationToolPlugin,
  AnnotationToolSessionContext,
} from "../../tools/annotation-tool-plugin.types";
import type { AnnotationModeSession } from "./annotation-mode-session.types";

type UseManagedAnnotationKeyboardShortcutsOptions = {
  activePlugin: AnnotationToolPlugin | null;
  activeToolType: AnnotationToolType;
  activeToolSession: AnnotationModeSession | null;
  primaryInteractionToolId: AnnotationToolType | null;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  requestFinishMeasurement: () => boolean;
  requestStartMeasurement: (toolType?: AnnotationToolType) => void;
  requestModeChange: (toolType: AnnotationToolType) => void;
  sessionContext: AnnotationToolSessionContext;
  setActiveToolTypeInStore: (toolType: AnnotationToolType) => void;
};

export const useManagedAnnotationKeyboardShortcuts = ({
  activePlugin,
  activeToolType,
  activeToolSession,
  primaryInteractionToolId,
  focusAdjacentAnnotationEntry,
  requestFinishMeasurement,
  requestStartMeasurement,
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
        commonAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.DELETE_SELECTION ||
        commonAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT
      ) {
        const runtimeState = sessionContext.getState();
        const selectedAnnotationIds =
          runtimeState.selectionState.selectedAnnotationIds;

        if (selectedAnnotationIds.length > 0) {
          const removableAnnotationIds =
            resolveRemovableSelectedAnnotationIds(runtimeState);
          if (removableAnnotationIds.length > 0) {
            sessionContext.dispatch(
              removeAnnotationsByIds({
                annotationIds: removableAnnotationIds,
              })
            );
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (
        commonAction ===
          ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL &&
        primaryInteractionToolId !== null &&
        activeToolType !== primaryInteractionToolId
      ) {
        activeToolSession?.discardDraft();
        setActiveToolTypeInStore(primaryInteractionToolId);
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
          requestStartMeasurement,
          requestModeChange,
          sessionContext,
        })
      ) {
        return;
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
    focusAdjacentAnnotationEntry,
    primaryInteractionToolId,
    requestFinishMeasurement,
    requestModeChange,
    requestStartMeasurement,
    sessionContext,
    setActiveToolTypeInStore,
  ]);
};
