import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  makeTemporaryEntriesPermanent,
  upsertCollectionEntry,
} from "../utils/temporaryCollection";

type AnnotationCollectionEntry = {
  id: string;
  type: string;
  temporary?: boolean;
};

type AnnotationPointCreateEntryArgs<
  TEntry extends AnnotationCollectionEntry,
  TPayload,
> = {
  pointId: string;
  payload: TPayload;
  previousCollection?: TEntry[];
  temporaryMode: boolean;
  useTemporaryForCreatedEntries: boolean;
};

type UseAnnotationPointCreationOptions<
  TEntry extends AnnotationCollectionEntry,
  TPayload,
> = {
  temporaryMode: boolean;
  setCollection: Dispatch<SetStateAction<TEntry[]>>;
  useTemporaryForCreatedEntries?: boolean;
  createEntry: (
    args: AnnotationPointCreateEntryArgs<TEntry, TPayload>
  ) => TEntry;
  onPointCreated?: (pointId: string, payload: TPayload) => void;
  onLineFinish?: () => void;
  createPointId?: () => string;
};

type UseAnnotationPointCreationResult<TPayload> = {
  handlePointCreate: (payload: TPayload) => void;
  handleLineFinish: () => void;
};

const createDefaultPointId = () => `point-${Date.now()}`;

export const useAnnotationPointCreation = <
  TEntry extends AnnotationCollectionEntry,
  TPayload,
>({
  temporaryMode,
  setCollection,
  useTemporaryForCreatedEntries = true,
  createEntry,
  onPointCreated,
  onLineFinish,
  createPointId = createDefaultPointId,
}: UseAnnotationPointCreationOptions<
  TEntry,
  TPayload
>): UseAnnotationPointCreationResult<TPayload> => {
  const prevTemporaryModeRef = useRef(temporaryMode);
  const temporaryModeRef = useRef(temporaryMode);
  const useTemporaryForCreatedEntriesRef = useRef(useTemporaryForCreatedEntries);
  const createEntryRef = useRef(createEntry);
  const onPointCreatedRef = useRef(onPointCreated);
  const onLineFinishRef = useRef(onLineFinish);
  const createPointIdRef = useRef(createPointId);

  useEffect(() => {
    temporaryModeRef.current = temporaryMode;
    if (prevTemporaryModeRef.current && !temporaryMode) {
      makeTemporaryEntriesPermanent(setCollection);
    }
    prevTemporaryModeRef.current = temporaryMode;
  }, [temporaryMode, setCollection]);

  useEffect(() => {
    useTemporaryForCreatedEntriesRef.current = useTemporaryForCreatedEntries;
  }, [useTemporaryForCreatedEntries]);

  useEffect(() => {
    createEntryRef.current = createEntry;
  }, [createEntry]);

  useEffect(() => {
    onPointCreatedRef.current = onPointCreated;
  }, [onPointCreated]);

  useEffect(() => {
    onLineFinishRef.current = onLineFinish;
  }, [onLineFinish]);

  useEffect(() => {
    createPointIdRef.current = createPointId;
  }, [createPointId]);

  const handlePointCreate = useCallback(
    (payload: TPayload) => {
      const pointId = createPointIdRef.current();
      const activeTemporaryMode = temporaryModeRef.current;
      const useTemporaryForCreate =
        activeTemporaryMode && useTemporaryForCreatedEntriesRef.current;

      upsertCollectionEntry(
        setCollection,
        (previousCollection) =>
          createEntryRef.current({
            pointId,
            payload,
            previousCollection,
            temporaryMode: activeTemporaryMode,
            useTemporaryForCreatedEntries:
              useTemporaryForCreatedEntriesRef.current,
          }),
        useTemporaryForCreate
      );

      onPointCreatedRef.current?.(pointId, payload);
    },
    [setCollection]
  );

  const handleLineFinish = useCallback(() => {
    onLineFinishRef.current?.();
  }, []);

  return {
    handlePointCreate,
    handleLineFinish,
  };
};
