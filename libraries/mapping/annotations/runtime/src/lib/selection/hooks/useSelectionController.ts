import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { getUniqueIds } from "@carma-mapping/annotations/core";
import { type Scene } from "@carma/cesium";

import type { AnnotationSelectionState } from "../types/annotationSelection.types";
import { replaceAnnotationsStoreState, useStoreSelector } from "../../store";
import type {
  AnnotationSelectionStoreState,
  AnnotationsStore,
} from "../../store";
import {
  areStringListsEqual,
  resolveSetStateAction,
} from "../../store/stateUpdateUtils";
import type { RectangleSelectionState } from "./useRectangleSelectionOverlay";
const getPrimarySelectedAnnotationId = (
  selectedAnnotationIds: readonly string[]
): string | null =>
  selectedAnnotationIds[selectedAnnotationIds.length - 1] ?? null;

export const useSelectionController = (
  annotationsStore: AnnotationsStore,
  scene: Scene | null,
  selectableAnnotationIds: ReadonlySet<string>
) => {
  const {
    selectedAnnotationIds,
    previousSelectedAnnotationId,
    selectionModeActive,
    selectModeAdditive,
    selectModeRectangle,
  } = useStoreSelector(annotationsStore, (state) => state.selectionState);
  const selectedAnnotationId = getPrimarySelectedAnnotationId(
    selectedAnnotationIds
  );
  const [selectModeShiftHeld, setSelectModeShiftHeld] = useState(false);

  const setSelectionState = useCallback(
    (
      updater:
        | AnnotationSelectionStoreState
        | ((
            previousState: AnnotationSelectionStoreState
          ) => AnnotationSelectionStoreState)
    ) => {
      const previousStoreState = annotationsStore.getState();
      const nextSelectionState =
        typeof updater === "function"
          ? updater(previousStoreState.selectionState)
          : updater;

      if (Object.is(nextSelectionState, previousStoreState.selectionState)) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          selectionState: nextSelectionState,
        })
      );
    },
    [annotationsStore]
  );

  const setSelectionModeActive = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextValueOrUpdater) => {
      setSelectionState((previousState) => {
        const nextSelectionModeActive = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.selectionModeActive
        );

        return nextSelectionModeActive === previousState.selectionModeActive
          ? previousState
          : {
              ...previousState,
              selectionModeActive: nextSelectionModeActive,
            };
      });
    },
    [setSelectionState]
  );

  const setSelectModeAdditive = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextValueOrUpdater) => {
      setSelectionState((previousState) => {
        const nextSelectModeAdditive = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.selectModeAdditive
        );

        return nextSelectModeAdditive === previousState.selectModeAdditive
          ? previousState
          : {
              ...previousState,
              selectModeAdditive: nextSelectModeAdditive,
            };
      });
    },
    [setSelectionState]
  );

  const setSelectModeRectangle = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextValueOrUpdater) => {
      setSelectionState((previousState) => {
        const nextSelectModeRectangle = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.selectModeRectangle
        );

        return nextSelectModeRectangle === previousState.selectModeRectangle
          ? previousState
          : {
              ...previousState,
              selectModeRectangle: nextSelectModeRectangle,
            };
      });
    },
    [setSelectionState]
  );

  useEffect(
    function effectTrackSelectionShiftKeyState() {
      if (!selectionModeActive) {
        setSelectModeShiftHeld(false);
        return;
      }

      const handleShiftKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Shift") {
          return;
        }

        setSelectModeShiftHeld((previousValue) =>
          previousValue ? previousValue : true
        );
      };

      const handleShiftKeyUp = (event: KeyboardEvent) => {
        if (event.key !== "Shift") {
          return;
        }

        setSelectModeShiftHeld((previousValue) =>
          previousValue ? false : previousValue
        );
      };

      const handleWindowBlur = () => {
        setSelectModeShiftHeld(false);
      };

      window.addEventListener("keydown", handleShiftKeyDown, true);
      window.addEventListener("keyup", handleShiftKeyUp, true);
      window.addEventListener("blur", handleWindowBlur, true);

      return () => {
        window.removeEventListener("keydown", handleShiftKeyDown, true);
        window.removeEventListener("keyup", handleShiftKeyUp, true);
        window.removeEventListener("blur", handleWindowBlur, true);
      };
    },
    [selectionModeActive]
  );

  const effectiveSelectModeAdditive = useMemo(
    () => selectModeAdditive || (selectionModeActive && selectModeShiftHeld),
    [selectModeAdditive, selectionModeActive, selectModeShiftHeld]
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
      setSelectionState((previousState) => {
        if (previousState.selectedAnnotationIds.length === 0) {
          return previousState;
        }

        const nextSelectedAnnotationIds =
          previousState.selectedAnnotationIds.filter((id) =>
            selectableAnnotationIds.has(id)
          );

        if (
          nextSelectedAnnotationIds.length ===
            previousState.selectedAnnotationIds.length &&
          areStringListsEqual(
            nextSelectedAnnotationIds,
            previousState.selectedAnnotationIds
          )
        ) {
          return previousState;
        }
        const nextPreviousSelectedAnnotationId =
          previousState.previousSelectedAnnotationId &&
          !selectableAnnotationIds.has(
            previousState.previousSelectedAnnotationId
          )
            ? null
            : previousState.previousSelectedAnnotationId;

        return {
          ...previousState,
          selectedAnnotationIds: nextSelectedAnnotationIds,
          previousSelectedAnnotationId: nextPreviousSelectedAnnotationId,
        };
      });
    },
    [selectableAnnotationIds, setSelectionState]
  );

  const clearPointSelection = useCallback(() => {
    setSelectionState((previousState) => {
      if (
        previousState.selectedAnnotationIds.length === 0 &&
        previousState.previousSelectedAnnotationId === null
      ) {
        return previousState;
      }

      return {
        ...previousState,
        selectedAnnotationIds: [],
        previousSelectedAnnotationId: null,
      };
    });
  }, [setSelectionState]);

  const clearAnnotationSelection = useCallback(() => {
    clearPointSelection();
  }, [clearPointSelection]);

  const pruneSelectionByRemovedIds = useCallback(
    (removedIds: ReadonlySet<string>) => {
      if (removedIds.size === 0) {
        return;
      }

      setSelectionState((previousState) => {
        if (previousState.selectedAnnotationIds.length === 0) {
          return previousState;
        }

        const nextSelectedAnnotationIds =
          previousState.selectedAnnotationIds.filter(
            (id) => !removedIds.has(id) && selectableAnnotationIds.has(id)
          );

        if (
          areStringListsEqual(
            nextSelectedAnnotationIds,
            previousState.selectedAnnotationIds
          )
        ) {
          return previousState;
        }
        const nextPreviousSelectedAnnotationId =
          previousState.previousSelectedAnnotationId &&
          removedIds.has(previousState.previousSelectedAnnotationId)
            ? null
            : previousState.previousSelectedAnnotationId;

        return {
          ...previousState,
          selectedAnnotationIds: nextSelectedAnnotationIds,
          previousSelectedAnnotationId: nextPreviousSelectedAnnotationId,
        };
      });
    },
    [selectableAnnotationIds, setSelectionState]
  );

  const selectAnnotationIds = useCallback(
    (ids: string[], additive: boolean = false) => {
      const uniqueIncomingIds = getUniqueIds(
        ids.filter((id) => selectableAnnotationIds.has(id))
      );

      setSelectionState((previousState) => {
        const previousSelectedAnnotationId = getPrimarySelectedAnnotationId(
          previousState.selectedAnnotationIds
        );
        const nextSelectedAnnotationIds = additive
          ? getUniqueIds([
              ...previousState.selectedAnnotationIds,
              ...uniqueIncomingIds,
            ])
          : uniqueIncomingIds;
        const nextSelectedAnnotationId = getPrimarySelectedAnnotationId(
          nextSelectedAnnotationIds
        );
        const nextPreviousSelectedAnnotationId =
          previousSelectedAnnotationId &&
          nextSelectedAnnotationId &&
          previousSelectedAnnotationId !== nextSelectedAnnotationId
            ? previousSelectedAnnotationId
            : previousState.previousSelectedAnnotationId;

        if (
          areStringListsEqual(
            previousState.selectedAnnotationIds,
            nextSelectedAnnotationIds
          ) &&
          previousSelectedAnnotationId === nextSelectedAnnotationId &&
          previousState.previousSelectedAnnotationId ===
            nextPreviousSelectedAnnotationId
        ) {
          return previousState;
        }

        return {
          ...previousState,
          selectedAnnotationIds: nextSelectedAnnotationIds,
          previousSelectedAnnotationId: nextPreviousSelectedAnnotationId,
        };
      });
    },
    [selectableAnnotationIds, setSelectionState]
  );

  const selectAnnotationById = useCallback(
    (id: string | null) => {
      if (id !== null && !selectableAnnotationIds.has(id)) {
        return;
      }

      setSelectionState((previousState) => {
        const previousSelectedAnnotationId = getPrimarySelectedAnnotationId(
          previousState.selectedAnnotationIds
        );
        const nextSelectedAnnotationIds =
          id === null
            ? []
            : previousState.selectedAnnotationIds.length === 1 &&
              previousState.selectedAnnotationIds[0] === id
            ? previousState.selectedAnnotationIds
            : [id];
        const nextPreviousSelectedAnnotationId =
          previousSelectedAnnotationId &&
          id &&
          previousSelectedAnnotationId !== id
            ? previousSelectedAnnotationId
            : previousState.previousSelectedAnnotationId;

        if (
          areStringListsEqual(
            previousState.selectedAnnotationIds,
            nextSelectedAnnotationIds
          ) &&
          previousSelectedAnnotationId === nextPreviousSelectedAnnotationId
        ) {
          return previousState;
        }

        return {
          ...previousState,
          selectedAnnotationIds: nextSelectedAnnotationIds,
          previousSelectedAnnotationId: nextPreviousSelectedAnnotationId,
        };
      });
    },
    [selectableAnnotationIds, setSelectionState]
  );

  const selectAnnotationByIdImmediate = useCallback(
    (id: string | null) => {
      setSelectionState((previousState) => {
        const previousSelectedAnnotationId = getPrimarySelectedAnnotationId(
          previousState.selectedAnnotationIds
        );
        const nextSelectedAnnotationIds =
          id === null
            ? []
            : previousState.selectedAnnotationIds.length === 1 &&
              previousState.selectedAnnotationIds[0] === id
            ? previousState.selectedAnnotationIds
            : [id];
        const nextPreviousSelectedAnnotationId =
          previousSelectedAnnotationId &&
          id &&
          previousSelectedAnnotationId !== id
            ? previousSelectedAnnotationId
            : previousState.previousSelectedAnnotationId;

        if (
          previousSelectedAnnotationId === id &&
          areStringListsEqual(
            previousState.selectedAnnotationIds,
            nextSelectedAnnotationIds
          ) &&
          previousState.previousSelectedAnnotationId ===
            nextPreviousSelectedAnnotationId
        ) {
          return previousState;
        }

        return {
          ...previousState,
          selectedAnnotationIds: nextSelectedAnnotationIds,
          previousSelectedAnnotationId: nextPreviousSelectedAnnotationId,
        };
      });
    },
    [setSelectionState]
  );

  const annotationSelection = useMemo<AnnotationSelectionState>(
    () => ({
      selectedAnnotationId,
      selectedAnnotationIds,
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

  return {
    selectedAnnotationId,
    selectedAnnotationIds,
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
  typeof useSelectionController
>;
