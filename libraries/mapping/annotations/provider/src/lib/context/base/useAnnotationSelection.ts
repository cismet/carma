import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type Scene } from "@carma/cesium";

import { getUniqueIds } from "./hooks/selectionSet";
import type { RectangleSelectionState } from "../hooks/selection/useRectangleSelectionOverlay";
import type { AnnotationSelectionState } from "../hooks/selection/annotationSelection.types";
import { useSelectionToolState } from "../hooks/selection/useSelectionToolState";

const areIdListsEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((id, index) => id === right[index]);
};

export const useAnnotationSelection = (
  scene: Scene | null,
  selectableAnnotationIds: ReadonlySet<string>,
  initialSelectionModeActive: boolean = false
) => {
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>(
    []
  );
  const selectedAnnotationIdRef = useRef<string | null>(null);
  const [previousSelectedAnnotationId, setPreviousSelectedAnnotationId] =
    useState<string | null>(null);
  const {
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    selectModeRectangle,
    setSelectModeRectangle,
    effectiveSelectModeAdditive,
  } = useSelectionToolState(initialSelectionModeActive);

  useEffect(
    function effectSyncSelectedAnnotationIdRef() {
      selectedAnnotationIdRef.current = selectedAnnotationId;
    },
    [selectedAnnotationId]
  );

  useEffect(
    function effectToggleSelectionAdditiveCursor() {
      if (
        !scene ||
        scene.isDestroyed() ||
        !selectionModeActive ||
        !effectiveSelectModeAdditive
      ) {
        return;
      }

      const plusCursor = document.createElement("div");
      plusCursor.textContent = "+";
      plusCursor.style.position = "fixed";
      plusCursor.style.pointerEvents = "none";
      plusCursor.style.userSelect = "none";
      plusCursor.style.zIndex = "10000";
      plusCursor.style.fontSize = "16px";
      plusCursor.style.fontWeight = "700";
      plusCursor.style.lineHeight = "1";
      plusCursor.style.color = "rgba(255, 255, 255, 0.95)";
      plusCursor.style.textShadow = "0 0 2px rgba(0, 0, 0, 0.85)";
      plusCursor.style.display = "none";
      document.body.appendChild(plusCursor);

      const updatePlusCursorPosition = (event: PointerEvent) => {
        const canvasRect = scene.canvas.getBoundingClientRect();
        const insideCanvas =
          event.clientX >= canvasRect.left &&
          event.clientX <= canvasRect.right &&
          event.clientY >= canvasRect.top &&
          event.clientY <= canvasRect.bottom;

        if (!insideCanvas) {
          plusCursor.style.display = "none";
          return;
        }

        plusCursor.style.left = `${event.clientX + 10}px`;
        plusCursor.style.top = `${event.clientY + 8}px`;
        plusCursor.style.display = "block";
      };

      const hidePlusCursor = () => {
        plusCursor.style.display = "none";
      };

      window.addEventListener("pointermove", updatePlusCursorPosition, true);
      scene.canvas.addEventListener("pointerleave", hidePlusCursor);
      window.addEventListener("blur", hidePlusCursor, true);

      return () => {
        window.removeEventListener(
          "pointermove",
          updatePlusCursorPosition,
          true
        );
        scene.canvas.removeEventListener("pointerleave", hidePlusCursor);
        window.removeEventListener("blur", hidePlusCursor, true);
        plusCursor.remove();
      };
    },
    [scene, selectionModeActive, effectiveSelectModeAdditive]
  );

  useEffect(
    function effectPruneSelectedAnnotationIds() {
      setSelectedAnnotationIds((previousIds) => {
        if (previousIds.length === 0) {
          return previousIds;
        }

        const nextIds = previousIds.filter((id) =>
          selectableAnnotationIds.has(id)
        );
        if (areIdListsEqual(previousIds, nextIds)) {
          return previousIds;
        }

        const nextPrimaryId = nextIds[nextIds.length - 1] ?? null;
        selectedAnnotationIdRef.current = nextPrimaryId;
        setSelectedAnnotationId((previousSelectedId) =>
          previousSelectedId === nextPrimaryId
            ? previousSelectedId
            : nextPrimaryId
        );
        return nextIds;
      });
    },
    [selectableAnnotationIds]
  );

  useEffect(
    function effectClearMissingSelectedAnnotationId() {
      if (!selectedAnnotationId) {
        return;
      }

      if (!selectableAnnotationIds.has(selectedAnnotationId)) {
        selectedAnnotationIdRef.current = null;
        setSelectedAnnotationId(null);
      }
    },
    [selectableAnnotationIds, selectedAnnotationId]
  );

  useEffect(
    function effectClearMissingPreviousSelectedAnnotationId() {
      if (!previousSelectedAnnotationId) {
        return;
      }

      if (!selectableAnnotationIds.has(previousSelectedAnnotationId)) {
        setPreviousSelectedAnnotationId(null);
      }
    },
    [previousSelectedAnnotationId, selectableAnnotationIds]
  );

  const clearPointSelection = useCallback(() => {
    selectedAnnotationIdRef.current = null;
    setSelectedAnnotationId((previousSelectedId) =>
      previousSelectedId === null ? previousSelectedId : null
    );
    setSelectedAnnotationIds((previousIds) =>
      previousIds.length === 0 ? previousIds : []
    );
    setPreviousSelectedAnnotationId((previousSelectedId) =>
      previousSelectedId === null ? previousSelectedId : null
    );
  }, []);

  const clearAnnotationSelection = useCallback(() => {
    clearPointSelection();
  }, [clearPointSelection]);

  const pruneSelectionByRemovedIds = useCallback(
    (removedIds: ReadonlySet<string>) => {
      if (removedIds.size === 0) {
        return;
      }

      setSelectedAnnotationIds((previousIds) => {
        if (previousIds.length === 0) {
          return previousIds;
        }

        const nextIds = previousIds.filter(
          (id) => !removedIds.has(id) && selectableAnnotationIds.has(id)
        );
        if (areIdListsEqual(previousIds, nextIds)) {
          return previousIds;
        }

        const nextPrimaryId = nextIds[nextIds.length - 1] ?? null;
        selectedAnnotationIdRef.current = nextPrimaryId;
        setSelectedAnnotationId((previousSelectedId) =>
          previousSelectedId === nextPrimaryId
            ? previousSelectedId
            : nextPrimaryId
        );
        return nextIds;
      });

      setPreviousSelectedAnnotationId((previousSelectedId) =>
        previousSelectedId && removedIds.has(previousSelectedId)
          ? null
          : previousSelectedId
      );
    },
    [selectableAnnotationIds]
  );

  const selectAnnotationIds = useCallback(
    (ids: string[], additive: boolean = false) => {
      const uniqueIncomingIds = getUniqueIds(
        ids.filter((id) => selectableAnnotationIds.has(id))
      );

      setSelectedAnnotationIds((previousIds) => {
        const nextIds = additive
          ? getUniqueIds([...previousIds, ...uniqueIncomingIds])
          : uniqueIncomingIds;
        const nextPrimaryId = nextIds[nextIds.length - 1] ?? null;
        const previousPrimaryId = selectedAnnotationIdRef.current;

        selectedAnnotationIdRef.current = nextPrimaryId;
        setSelectedAnnotationId((previousSelectedId) =>
          previousSelectedId === nextPrimaryId
            ? previousSelectedId
            : nextPrimaryId
        );

        if (
          previousPrimaryId &&
          nextPrimaryId &&
          previousPrimaryId !== nextPrimaryId
        ) {
          setPreviousSelectedAnnotationId((currentPreviousId) =>
            currentPreviousId === previousPrimaryId
              ? currentPreviousId
              : previousPrimaryId
          );
        }

        return areIdListsEqual(previousIds, nextIds) ? previousIds : nextIds;
      });
    },
    [selectableAnnotationIds]
  );

  const selectAnnotationById = useCallback(
    (id: string | null) => {
      if (id !== null && !selectableAnnotationIds.has(id)) {
        return;
      }

      const previousPrimaryId = selectedAnnotationIdRef.current;
      selectedAnnotationIdRef.current = id;

      setSelectedAnnotationId((previousSelectedId) =>
        previousSelectedId === id ? previousSelectedId : id
      );
      setSelectedAnnotationIds((previousIds) => {
        if (id === null) {
          return previousIds.length === 0 ? previousIds : [];
        }

        return previousIds.length === 1 && previousIds[0] === id
          ? previousIds
          : [id];
      });

      if (previousPrimaryId && id && previousPrimaryId !== id) {
        setPreviousSelectedAnnotationId((currentPreviousId) =>
          currentPreviousId === previousPrimaryId
            ? currentPreviousId
            : previousPrimaryId
        );
      }
    },
    [selectableAnnotationIds]
  );

  const selectAnnotationByIdImmediate = useCallback((id: string | null) => {
    const previousPrimaryId = selectedAnnotationIdRef.current;
    selectedAnnotationIdRef.current = id;

    setSelectedAnnotationId((previousSelectedId) =>
      previousSelectedId === id ? previousSelectedId : id
    );
    setSelectedAnnotationIds((previousIds) => {
      if (id === null) {
        return previousIds.length === 0 ? previousIds : [];
      }

      return previousIds.length === 1 && previousIds[0] === id
        ? previousIds
        : [id];
    });

    if (previousPrimaryId && id && previousPrimaryId !== id) {
      setPreviousSelectedAnnotationId((currentPreviousId) =>
        currentPreviousId === previousPrimaryId
          ? currentPreviousId
          : previousPrimaryId
      );
    }
  }, []);

  const annotationSelection = useMemo<AnnotationSelectionState>(
    () => ({
      selectedAnnotationId: selectedAnnotationId,
      selectedAnnotationIds: selectedAnnotationIds,
    }),
    [selectedAnnotationId, selectedAnnotationIds]
  );

  const rectangleSelection = useMemo<RectangleSelectionState>(
    () => ({
      enabled: selectionModeActive && selectModeRectangle,
      additiveMode: effectiveSelectModeAdditive,
      onSelect: selectAnnotationIds,
    }),
    [
      effectiveSelectModeAdditive,
      selectAnnotationIds,
      selectModeRectangle,
      selectionModeActive,
    ]
  );

  const selectedDistancePair = useMemo(() => {
    if (!selectedAnnotationId || !previousSelectedAnnotationId) {
      return null;
    }

    if (selectedAnnotationId === previousSelectedAnnotationId) {
      return null;
    }

    if (
      !selectableAnnotationIds.has(selectedAnnotationId) ||
      !selectableAnnotationIds.has(previousSelectedAnnotationId)
    ) {
      return null;
    }

    return {
      activePointId: selectedAnnotationId,
      previousPointId: previousSelectedAnnotationId,
    };
  }, [
    previousSelectedAnnotationId,
    selectableAnnotationIds,
    selectedAnnotationId,
  ]);

  const contextValue = useMemo(
    () => ({
      selectedAnnotationId,
      selectedAnnotationIds,
      selectAnnotationIds,
      selectionModeActive,
      setSelectionModeActive,
      selectModeAdditive,
      setSelectModeAdditive,
      selectModeRectangle,
      setSelectModeRectangle,
      selectAnnotationById,
    }),
    [
      selectAnnotationById,
      selectAnnotationIds,
      selectModeAdditive,
      selectModeRectangle,
      selectedAnnotationId,
      selectedAnnotationIds,
      selectionModeActive,
      setSelectModeAdditive,
      setSelectModeRectangle,
      setSelectionModeActive,
    ]
  );

  return {
    contextValue,
    selectedAnnotationId,
    selectedAnnotationIds,
    selectedAnnotationIdRef,
    previousSelectedAnnotationId,
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    selectModeRectangle,
    setSelectModeRectangle,
    effectiveSelectModeAdditive,
    annotationSelection,
    rectangleSelection,
    selectedDistancePair,
    selectAnnotationIds,
    selectAnnotationById,
    selectAnnotationByIdImmediate,
    clearPointSelection,
    clearAnnotationSelection,
    pruneSelectionByRemovedIds,
  };
};

export type AnnotationSelectionController = ReturnType<
  typeof useAnnotationSelection
>;
