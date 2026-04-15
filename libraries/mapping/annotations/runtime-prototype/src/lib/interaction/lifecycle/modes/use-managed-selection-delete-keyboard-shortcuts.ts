import { useEffect, useMemo } from "react";

import { Modal } from "antd";

import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  isManagedAnnotationKeyboardEvent,
  resolveAnnotationCommonShortcutAction,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import { findProtectedPolygonCandidateNodeIds } from "./selection-deletion-policy";
export const useManagedSelectionDeleteKeyboardShortcuts = (
  selectedAnnotationIds: string[],
  selectedAnnotationId: string | null,
  selectablePointIds: ReadonlySet<string>,
  lockedAnnotationIdSet: ReadonlySet<string>,
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  clearAnnotationsByIds: (ids: string[]) => void,
  deleteSelectedAnnotations: () => void
) => {
  const deletableSelectedPointIds = useMemo(
    () =>
      selectedAnnotationIds.filter(
        (id) => selectablePointIds.has(id) && !lockedAnnotationIdSet.has(id)
      ),
    [lockedAnnotationIdSet, selectablePointIds, selectedAnnotationIds]
  );

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event, { allowRepeat: true })) {
        return;
      }

      const action = resolveAnnotationCommonShortcutAction(event);
      if (
        action !== ANNOTATION_COMMON_SHORTCUT_ACTIONS.DELETE_SELECTION &&
        action !== ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT
      ) {
        return;
      }

      const hasDeletablePrimarySelection =
        Boolean(selectedAnnotationId) &&
        selectablePointIds.has(selectedAnnotationId) &&
        !lockedAnnotationIdSet.has(selectedAnnotationId);

      if (
        deletableSelectedPointIds.length === 0 &&
        !hasDeletablePrimarySelection
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const protectedPolygonNodeIds = findProtectedPolygonCandidateNodeIds(
        new Set(deletableSelectedPointIds),
        nodeChainAnnotations
      );
      if (protectedPolygonNodeIds) {
        Modal.confirm({
          centered: true,
          title: "Polygon löschen?",
          content:
            "Ein einzelner Knoten kann bei Polygonen mit 3 oder weniger Punkten nicht gelöscht werden. Soll stattdessen das gesamte Polygon gelöscht werden?",
          okText: "Polygon löschen",
          cancelText: "Abbrechen",
          okButtonProps: { danger: true },
          onOk: () => {
            clearAnnotationsByIds(protectedPolygonNodeIds);
          },
        });
        return;
      }

      if (deletableSelectedPointIds.length > 1) {
        Modal.confirm({
          centered: true,
          title: "Mehrere Messungen löschen",
          content: `${deletableSelectedPointIds.length} ausgewählte Messungen wirklich löschen?`,
          okText: "Löschen",
          cancelText: "Abbrechen",
          okButtonProps: { danger: true },
          onOk: () => {
            deleteSelectedAnnotations();
          },
        });
        return;
      }

      deleteSelectedAnnotations();
    };

    window.addEventListener("keydown", handleDeleteKey, true);
    return () => {
      window.removeEventListener("keydown", handleDeleteKey, true);
    };
  }, [
    clearAnnotationsByIds,
    deleteSelectedAnnotations,
    deletableSelectedPointIds,
    lockedAnnotationIdSet,
    nodeChainAnnotations,
    selectablePointIds,
    selectedAnnotationId,
  ]);
};
