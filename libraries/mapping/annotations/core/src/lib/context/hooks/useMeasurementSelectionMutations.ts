import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

type UseMeasurementSelectionMutationsParams = {
  selectableMeasurementIds: ReadonlySet<string>;
  selectedMeasurementIdRef: MutableRefObject<string | null>;
  setSelectedMeasurementId: Dispatch<SetStateAction<string | null>>;
  setSelectedMeasurementIds: Dispatch<SetStateAction<string[]>>;
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

const getUniqueIds = (ids: string[]) => Array.from(new Set(ids));

export const useMeasurementSelectionMutations = ({
  selectableMeasurementIds,
  selectedMeasurementIdRef,
  setSelectedMeasurementId,
  setSelectedMeasurementIds,
  onPrimarySelectionChange,
  onSelectionIdsChange,
}: UseMeasurementSelectionMutationsParams) => {
  const selectMeasurementIds = useCallback(
    (ids: string[], additive: boolean = false) => {
      const uniqueIncomingIds = getUniqueIds(
        ids.filter((id) => selectableMeasurementIds.has(id))
      );

      setSelectedMeasurementIds((prev) => {
        const next = additive
          ? getUniqueIds([...prev, ...uniqueIncomingIds])
          : uniqueIncomingIds;
        const nextPrimaryId = next[next.length - 1] ?? null;
        const previousPrimaryId = selectedMeasurementIdRef.current;

        selectedMeasurementIdRef.current = nextPrimaryId;
        setSelectedMeasurementId((prevSelectedId) =>
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
      selectableMeasurementIds,
      selectedMeasurementIdRef,
      setSelectedMeasurementId,
      setSelectedMeasurementIds,
    ]
  );

  const selectMeasurementById = useCallback(
    (id: string | null) => {
      if (id !== null && !selectableMeasurementIds.has(id)) {
        return;
      }

      const previousPrimaryId = selectedMeasurementIdRef.current;
      selectedMeasurementIdRef.current = id;

      setSelectedMeasurementId((prev) => (prev === id ? prev : id));
      setSelectedMeasurementIds((prev) => {
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
      selectableMeasurementIds,
      selectedMeasurementIdRef,
      setSelectedMeasurementId,
      setSelectedMeasurementIds,
    ]
  );

  return {
    selectMeasurementIds,
    selectMeasurementById,
  };
};
