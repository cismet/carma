import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  AnnotationCollection,
  AnnotationEntry,
  AnnotationMode,
} from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma-cesium";

import type {
  AnnotationsContextType,
  AnnotationCollectionContextType,
  AnnotationEditingContextType,
  AnnotationSelectionContextType,
  AnnotationSettingsContextType,
  AnnotationToolsContextType,
} from "../context/annotationsContext.types";
import type {
  AnnotationsStore,
  AnnotationsStoreState,
} from "./annotationsStore.types";
const EMPTY_ANNOTATIONS: AnnotationEntry[] = [];

export const AnnotationsStoreContext = createContext<
  AnnotationsStore | undefined
>(undefined);
export const AnnotationsContext = createContext<
  AnnotationsContextType | undefined
>(undefined);
export const AnnotationToolsContext = createContext<
  AnnotationToolsContextType | undefined
>(undefined);
export const AnnotationSelectionContext = createContext<
  AnnotationSelectionContextType | undefined
>(undefined);
export const AnnotationCollectionContext = createContext<
  AnnotationCollectionContextType | undefined
>(undefined);
export const AnnotationEditingContext = createContext<
  AnnotationEditingContextType | undefined
>(undefined);
export const AnnotationSettingsContext = createContext<
  AnnotationSettingsContextType | undefined
>(undefined);

const useRequiredContext = <TContext>(
  contextValue: TContext | undefined,
  hookName: string
): TContext => {
  if (contextValue === undefined) {
    throw new Error(`${hookName} must be used within a AnnotationsProvider`);
  }

  return contextValue;
};

export const useRequiredAnnotationsStore = (
  store: AnnotationsStore | undefined,
  hookName: string
): AnnotationsStore => useRequiredContext(store, hookName);

const useAnnotationsContext = (): AnnotationsContextType =>
  useRequiredContext(useContext(AnnotationsContext), "useAnnotationsContext");

export const useAnnotationsStore = (hookName: string): AnnotationsStore =>
  useRequiredAnnotationsStore(useContext(AnnotationsStoreContext), hookName);

export const useStoreSelector = <TSelected>(
  annotationsStore: AnnotationsStore,
  selector: (state: AnnotationsStoreState) => TSelected
): TSelected => {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const [selectedValue, setSelectedValue] = useState<TSelected>(() =>
    selector(annotationsStore.getState())
  );

  useEffect(() => {
    const readSelectedValue = () =>
      selectorRef.current(annotationsStore.getState());

    setSelectedValue(readSelectedValue());
    return annotationsStore.subscribe(() => {
      setSelectedValue((previousValue) => {
        const nextValue = readSelectedValue();
        return Object.is(previousValue, nextValue) ? previousValue : nextValue;
      });
    });
  }, [annotationsStore]);

  return selectedValue;
};

const useTable = (): AnnotationCollection => {
  const annotationsStore = useAnnotationsStore("useTable");

  return useStoreSelector(annotationsStore, (state) => state.annotationEntries);
};

const useEntriesByTypeMap = (): ReadonlyMap<
  AnnotationMode,
  AnnotationEntry[]
> => {
  const annotationEntries = useTable();

  return useMemo(() => {
    const entriesByType = new Map<AnnotationMode, AnnotationEntry[]>();

    annotationEntries.forEach((annotation) => {
      const typeEntries = entriesByType.get(annotation.type);
      if (typeEntries) {
        typeEntries.push(annotation);
        return;
      }

      entriesByType.set(annotation.type, [annotation]);
    });

    return entriesByType;
  }, [annotationEntries]);
};

export const useTools = (): AnnotationToolsContextType =>
  useAnnotationsContext().tools;

export const useSelectionState = (): AnnotationSelectionContextType =>
  useAnnotationsContext().selection;

export const useCollection = (): AnnotationCollectionContextType =>
  useAnnotationsContext().annotations;

export const useEditingState = (): AnnotationEditingContextType =>
  useAnnotationsContext().edit;

export const useEntries = (): AnnotationCollection => useTable();

export const useEntriesByType = <
  TAnnotation extends AnnotationEntry = AnnotationEntry
>(
  type: AnnotationMode
): TAnnotation[] => {
  const annotationEntriesByTypeMap = useEntriesByTypeMap();

  return useMemo(
    () =>
      (annotationEntriesByTypeMap.get(type) ??
        EMPTY_ANNOTATIONS) as TAnnotation[],
    [annotationEntriesByTypeMap, type]
  );
};

export const useEntriesByTypes = <
  TAnnotation extends AnnotationEntry = AnnotationEntry
>(
  types: readonly AnnotationMode[]
): TAnnotation[] => {
  const annotationEntriesByTypeMap = useEntriesByTypeMap();

  return useMemo(
    () =>
      types.flatMap(
        (type) =>
          (annotationEntriesByTypeMap.get(type) ??
            EMPTY_ANNOTATIONS) as TAnnotation[]
      ),
    [annotationEntriesByTypeMap, types]
  );
};

export const useSettings = (): AnnotationSettingsContextType =>
  useAnnotationsContext().settings;

export const useReferencePoint = (): Cartesian3 | null => {
  const annotationsStore = useAnnotationsStore("useReferencePoint");

  return useStoreSelector(annotationsStore, (state) => state.referencePoint);
};
