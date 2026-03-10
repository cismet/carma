import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { getUniqueIds } from "./selectionSet";

type UseAnnotationSelectionMutationsParams = {
  setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
  setSelectedAnnotationIds: Dispatch<SetStateAction<string[]>>;
  onPrimarySelectionChange?: (
    nextPrimaryId: string | null,
    previousPrimaryId: string | null
  ) => void;
  onSelectionIdsChange?: (
    nextIds: string[],
    nextPrimaryId: string | null,
    previousPrimaryId: string | null
  ) => void;
};

export const useAnnotationSelectionMutations = (
  selectableAnnotationIds: ReadonlySet<string>,
  selectedAnnotationIdRef: MutableRefObject<string | null>,
  {
    setSelectedAnnotationId,
    setSelectedAnnotationIds,
    onPrimarySelectionChange,
    onSelectionIdsChange,
  }: UseAnnotationSelectionMutationsParams
) => {
  const selectAnnotationIds = useCallback(
    (ids: string[], additive: boolean = false) => {
      const uniqueIncomingIds = getUniqueIds(
        ids.filter((id) => selectableAnnotationIds.has(id))
      );

      setSelectedAnnotationIds((prev) => {
        const next = additive
          ? getUniqueIds([...prev, ...uniqueIncomingIds])
          : uniqueIncomingIds;
        const nextPrimaryId = next[next.length - 1] ?? null;
        const previousPrimaryId = selectedAnnotationIdRef.current;

        selectedAnnotationIdRef.current = nextPrimaryId;
        setSelectedAnnotationId((prevSelectedId) =>
          prevSelectedId === nextPrimaryId ? prevSelectedId : nextPrimaryId
        );

        if (previousPrimaryId !== nextPrimaryId) {
          onPrimarySelectionChange?.(nextPrimaryId, previousPrimaryId);
        }
        onSelectionIdsChange?.(next, nextPrimaryId, previousPrimaryId);
        return next;
      });
    },
    [
      onPrimarySelectionChange,
      onSelectionIdsChange,
      selectableAnnotationIds,
      selectedAnnotationIdRef,
      setSelectedAnnotationId,
      setSelectedAnnotationIds,
    ]
  );

  const selectAnnotationById = useCallback(
    (id: string | null) => {
      if (id !== null && !selectableAnnotationIds.has(id)) {
        return;
      }

      const previousPrimaryId = selectedAnnotationIdRef.current;
      selectedAnnotationIdRef.current = id;

      setSelectedAnnotationId((prev) => (prev === id ? prev : id));
      setSelectedAnnotationIds((prev) => {
        const next =
          id === null ? [] : prev.length === 1 && prev[0] === id ? prev : [id];
        onSelectionIdsChange?.(next, id, previousPrimaryId);
        return next;
      });

      if (previousPrimaryId !== id) {
        onPrimarySelectionChange?.(id, previousPrimaryId);
      }
    },
    [
      onPrimarySelectionChange,
      onSelectionIdsChange,
      selectableAnnotationIds,
      selectedAnnotationIdRef,
      setSelectedAnnotationId,
      setSelectedAnnotationIds,
    ]
  );

  return {
    selectAnnotationIds,
    selectAnnotationById,
  };
};
