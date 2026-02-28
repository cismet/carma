import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

export type AnnotationCoreEntry = {
  id: string;
  name?: string;
  locked?: boolean;
};

export type UseAnnotationCoreStateParams<
  TMode extends string,
  TMeasurement extends AnnotationCoreEntry
> = {
  initialMode: TMode;
  initialMeasurements?: TMeasurement[];
  initialShowLabels?: boolean;
  isSelectableMeasurementId?: (
    measurementId: string,
    measurements: ReadonlyArray<TMeasurement>
  ) => boolean;
};

export type AnnotationCoreState<
  TMode extends string,
  TMeasurement extends AnnotationCoreEntry
> = {
  measurementMode: TMode;
  setMeasurementMode: Dispatch<SetStateAction<TMode>>;
  measurements: TMeasurement[];
  setMeasurements: Dispatch<SetStateAction<TMeasurement[]>>;
  selectedMeasurementId: string | null;
  setSelectedMeasurementId: Dispatch<SetStateAction<string | null>>;
  selectedMeasurementIds: string[];
  setSelectedMeasurementIds: Dispatch<SetStateAction<string[]>>;
  selectedMeasurementIdRef: MutableRefObject<string | null>;
  selectMeasurementById: (id: string | null) => void;
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  updateMeasurementNameById: (id: string, name: string) => void;
  toggleMeasurementLockById: (id: string) => void;
  showLabels: boolean;
  setShowLabels: Dispatch<SetStateAction<boolean>>;
};

const getUniqueIds = (ids: string[]) => Array.from(new Set(ids));

export const useAnnotationCoreState = <
  TMode extends string,
  TMeasurement extends AnnotationCoreEntry
>({
  initialMode,
  initialMeasurements = [],
  initialShowLabels = true,
  isSelectableMeasurementId,
}: UseAnnotationCoreStateParams<TMode, TMeasurement>): AnnotationCoreState<
  TMode,
  TMeasurement
> => {
  const [measurementMode, setMeasurementMode] = useState<TMode>(initialMode);
  const [measurements, setMeasurements] =
    useState<TMeasurement[]>(initialMeasurements);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<
    string | null
  >(null);
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<
    string[]
  >([]);
  const [showLabels, setShowLabels] = useState(initialShowLabels);
  const selectedMeasurementIdRef = useRef<string | null>(selectedMeasurementId);

  useEffect(() => {
    selectedMeasurementIdRef.current = selectedMeasurementId;
  }, [selectedMeasurementId]);

  const measurementIdSet = useMemo(
    () => new Set(measurements.map((measurement) => measurement.id)),
    [measurements]
  );

  const isSelectableId = useCallback(
    (id: string) => {
      if (!measurementIdSet.has(id)) return false;
      if (!isSelectableMeasurementId) return true;
      return isSelectableMeasurementId(id, measurements);
    },
    [isSelectableMeasurementId, measurementIdSet, measurements]
  );

  useEffect(() => {
    setSelectedMeasurementIds((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter((id) => measurementIdSet.has(id));
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
    setSelectedMeasurementId((prev) =>
      prev && measurementIdSet.has(prev) ? prev : null
    );
  }, [measurementIdSet]);

  const selectMeasurementById = useCallback(
    (id: string | null) => {
      if (id !== null && !isSelectableId(id)) {
        return;
      }

      selectedMeasurementIdRef.current = id;
      setSelectedMeasurementId((prev) => (prev === id ? prev : id));
      setSelectedMeasurementIds((prev) => {
        if (id === null) {
          return prev.length === 0 ? prev : [];
        }
        if (prev.length === 1 && prev[0] === id) {
          return prev;
        }
        return [id];
      });
    },
    [isSelectableId]
  );

  const selectMeasurementIds = useCallback(
    (ids: string[], additive: boolean = false) => {
      const validIds = getUniqueIds(ids.filter(isSelectableId));
      setSelectedMeasurementIds((prev) => {
        const next = additive ? getUniqueIds([...prev, ...validIds]) : validIds;
        const nextPrimary = next[next.length - 1] ?? null;
        selectedMeasurementIdRef.current = nextPrimary;
        setSelectedMeasurementId((prevSelected) =>
          prevSelected === nextPrimary ? prevSelected : nextPrimary
        );
        return next;
      });
    },
    [isSelectableId]
  );

  const clearSelection = useCallback(() => {
    selectedMeasurementIdRef.current = null;
    setSelectedMeasurementId((prev) => (prev === null ? prev : null));
    setSelectedMeasurementIds((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const updateMeasurementNameById = useCallback((id: string, name: string) => {
    const trimmedName = name.trim();
    setMeasurements((prev) => {
      let hasChanged = false;
      const next = prev.map((measurement) => {
        if (measurement.id !== id) return measurement;
        const currentName = measurement.name ?? "";
        if (currentName === trimmedName) return measurement;
        hasChanged = true;
        return {
          ...measurement,
          name: trimmedName,
        };
      });
      return hasChanged ? next : prev;
    });
  }, []);

  const toggleMeasurementLockById = useCallback((id: string) => {
    setMeasurements((prev) => {
      let hasChanged = false;
      const next = prev.map((measurement) => {
        if (measurement.id !== id) return measurement;
        hasChanged = true;
        return {
          ...measurement,
          locked: !measurement.locked,
        };
      });
      return hasChanged ? next : prev;
    });
  }, []);

  return {
    measurementMode,
    setMeasurementMode,
    measurements,
    setMeasurements,
    selectedMeasurementId,
    setSelectedMeasurementId,
    selectedMeasurementIds,
    setSelectedMeasurementIds,
    selectedMeasurementIdRef,
    selectMeasurementById,
    selectMeasurementIds,
    clearSelection,
    updateMeasurementNameById,
    toggleMeasurementLockById,
    showLabels,
    setShowLabels,
  };
};
